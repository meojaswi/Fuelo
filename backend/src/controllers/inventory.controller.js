const audit = require("../services/audit.service");
const Inventory = require("../models/inventory.model");
const PriceHistory = require("../models/priceHistory.model");
const Transaction = require("../models/transaction.model");
const { atomic, fail } = require("../services/atomic.service");
const { recordMovement, changeStock } = require("../services/stock.service");
const Tank = require("../models/tank.model");
const { roundMoney } = require("../utils/money");
const { lockWorkspace } = require("../services/workspaceWrite.service");

async function getAll(req, res) {
  const items = await Inventory.find({ workspaceId: req.workspaceId }).sort({ itemType: 1 });
  res.json(items);
}

function recordAdjustment(req, item, delta, context) {
  if (!delta) return;
  return recordMovement(
    {
      workspaceId: req.workspaceId,
      itemType: item.itemType,
      delta,
      reason: "manual_adjust",
      createdBy: req.user.userId,
      balanceAfter: item.currentStock,
    },
    context
  );
}

async function create(req, res) {
  const { workspaceId } = req;
  const { itemType, currentStock = 0, unit, pricePerUnit = 0 } = req.body;
  try {
    const item = await atomic(workspaceId, async (context) => {
      const entry = await new Inventory({
        workspaceId,
        itemType,
        currentStock,
        unit,
        pricePerUnit,
      }).save({ session: context.session });
      context.compensate(() => Inventory.deleteOne({ workspaceId, _id: entry._id }));
      await recordAdjustment(req, entry, currentStock, context);
      return entry;
    });
    await audit.record(req, {
      action: currentStock ? "stock.adjust" : "inventory.create",
      entityType: "inventory",
      entityId: item._id,
      summary: "Added an inventory item",
      meta: { itemType, stock: currentStock, pricePerUnit },
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code !== 11000) throw err;
    res.status(409).json({ error: `Inventory entry for "${itemType}" already exists` });
  }
}

async function update(req, res) {
  const { workspaceId } = req;
  const scope = { workspaceId, itemType: req.params.itemType };
  const { currentStock, pricePerUnit } = req.body;
  const { item, changes } = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    await lockWorkspace(workspaceId, context);
    const previous = await Inventory.findOne(scope).session(session);
    if (!previous) fail(404, "Inventory item not found");

    const updates = {};
    const tracked =
      currentStock !== undefined &&
      (await Tank.exists({ ...scope, isActive: true }).session(session));
    const delta = tracked ? roundMoney(roundMoney(currentStock) - previous.currentStock) : 0;
    const stock = delta
      ? await changeStock(
          { filter: scope, delta, reason: "manual_adjust", createdBy: req.user.userId },
          context
        )
      : previous;
    if (currentStock !== undefined && !tracked) updates.currentStock = currentStock;
    if (pricePerUnit !== undefined && pricePerUnit !== previous.pricePerUnit) {
      updates.pricePerUnit = pricePerUnit;
      updates.lastPriceUpdate = new Date();
      updates.priceSource = "manual";
    }
    if (!Object.keys(updates).length)
      return {
        item: stock,
        changes: { stock: Boolean(delta), previousStock: previous.currentStock },
      };

    const filter = {
      ...scope,
      _id: previous._id,
      currentStock: stock.currentStock,
      pricePerUnit: previous.pricePerUnit,
    };
    const entry = await Inventory.findOneAndUpdate(
      filter,
      { $set: updates },
      { new: true, session }
    );
    if (!entry) fail(409, "Inventory changed. Refresh and try again.");
    const original = Object.fromEntries(Object.keys(updates).map((key) => [key, previous[key]]));
    compensate(() =>
      Inventory.updateOne({ workspaceId, _id: previous._id, ...updates }, { $set: original })
    );
    if (!tracked)
      await recordAdjustment(req, entry, entry.currentStock - previous.currentStock, context);
    if (updates.pricePerUnit !== undefined) {
      await new PriceHistory({
        workspaceId,
        itemType: entry.itemType,
        oldPrice: previous.pricePerUnit,
        newPrice: entry.pricePerUnit,
        changedBy: req.user.userId,
        changedAt: entry.lastPriceUpdate,
      }).save({ session });
    }
    return {
      item: entry,
      changes: {
        stock: entry.currentStock !== previous.currentStock,
        price: updates.pricePerUnit !== undefined,
        previousStock: previous.currentStock,
        previousPrice: previous.pricePerUnit,
      },
    };
  });
  if (changes.stock)
    await audit.record(req, {
      action: "stock.adjust",
      entityType: "inventory",
      entityId: item._id,
      summary: "Adjusted inventory stock",
      meta: { previous: changes.previousStock, current: item.currentStock },
    });
  if (changes.price)
    await audit.record(req, {
      action: "price.update",
      entityType: "inventory",
      entityId: item._id,
      summary: "Updated unit price",
      meta: { previous: changes.previousPrice, current: item.pricePerUnit },
    });
  res.json(item);
}

async function remove(req, res) {
  const { workspaceId } = req;
  const scope = { workspaceId, itemType: req.params.itemType };
  const removed = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    await lockWorkspace(workspaceId, context);
    if (await Tank.exists(scope).session(session))
      fail(409, "Inventory linked to tanks cannot be removed");
    const item = await Inventory.findOneAndDelete(scope, { session });
    if (!item) fail(404, "Inventory item not found");
    compensate(() => Inventory.create(item.toObject()));
    if (
      await Transaction.exists({ workspaceId, inventoryId: item._id, status: "active" }).session(
        session
      )
    ) {
      fail(409, "Inventory with active sales cannot be removed because voiding restores stock");
    }
    await recordAdjustment(
      req,
      { itemType: item.itemType, currentStock: 0 },
      -item.currentStock,
      context
    );
    return item;
  });
  await audit.record(req, {
    action: "inventory.remove",
    entityType: "inventory",
    entityId: removed._id,
    summary: "Removed an inventory item",
    meta: { itemType: removed.itemType, previousStock: removed.currentStock },
  });
  res.json({ ok: true });
}

async function getPrices(req, res) {
  const items = await Inventory.find({ workspaceId: req.workspaceId })
    .select("itemType unit pricePerUnit -_id")
    .sort({ itemType: 1 });
  res.json(items);
}

module.exports = { getAll, getPrices, create, update, remove };
