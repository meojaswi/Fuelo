const audit = require("../services/audit.service");
const sales = require("../repositories/sales");
const pump = require("../repositories/pump");
const { query } = require("../config/postgres");
const { atomic, fail } = require("../services/atomic.service");
const { recordMovement, changeStock } = require("../services/stock.service");
const { roundMoney } = require("../utils/money");
const { lockWorkspace } = require("../services/workspaceWrite.service");

async function getAll(req, res) {
  res.json(await sales.listInventory(req.workspaceId));
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
      const entry = await sales.insertInventory(context.db, workspaceId, {
        itemType,
        currentStock,
        unit,
        pricePerUnit,
      });
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
    if (err.code !== "23505") throw err;
    res.status(409).json({ error: `Inventory entry for "${itemType}" already exists` });
  }
}

async function update(req, res) {
  const { workspaceId } = req;
  const { currentStock, pricePerUnit } = req.body;
  const { item, changes } = await atomic(workspaceId, async (context) => {
    const { db } = context;
    await lockWorkspace(workspaceId, context);
    const previous = await sales.getInventoryItem(db, workspaceId, req.params.itemType, {
      lock: true,
    });
    if (!previous) fail(404, "Inventory item not found");
    if (previous.pricingUnit && currentStock !== undefined)
      fail(409, "Adjust timber stock with quantity and pieces together");

    const updates = {};
    const tracked =
      currentStock !== undefined && (await pump.hasTanks(db, workspaceId, previous.itemType, { activeOnly: true }));
    const delta = tracked ? roundMoney(roundMoney(currentStock) - previous.currentStock) : 0;
    const stock = delta
      ? await changeStock(
          {
            filter: { workspaceId, itemType: previous.itemType },
            delta,
            reason: "manual_adjust",
            createdBy: req.user.userId,
          },
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

    const entry = await sales.updateInventory(db, workspaceId, previous._id, updates, {
      currentStock: stock.currentStock,
      pricePerUnit: previous.pricePerUnit,
    });
    if (!entry) fail(409, "Inventory changed. Refresh and try again.");
    if (!tracked)
      await recordAdjustment(req, entry, entry.currentStock - previous.currentStock, context);
    if (updates.pricePerUnit !== undefined) {
      await sales.insertPriceHistory(db, workspaceId, {
        itemType: entry.itemType,
        oldPrice: previous.pricePerUnit,
        newPrice: entry.pricePerUnit,
        changedBy: req.user.userId,
        changedAt: entry.lastPriceUpdate,
      });
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
  const removed = await atomic(workspaceId, async (context) => {
    const { db } = context;
    await lockWorkspace(workspaceId, context);
    const item = await sales.getInventoryItem(db, workspaceId, req.params.itemType, { lock: true });
    if (await pump.hasTanks(db, workspaceId, req.params.itemType))
      fail(409, "Inventory linked to tanks cannot be removed");
    if (item?.pricingUnit) fail(409, "Configured timber inventory retains its stock history");
    if (!item) fail(404, "Inventory item not found");
    if (await sales.hasActiveSalesFor(db, workspaceId, item._id)) {
      fail(409, "Inventory with active sales cannot be removed because voiding restores stock");
    }
    // The row stays (flagged removed) so voided sales keep pointing at their original item.
    await sales.removeInventory(db, workspaceId, item._id);
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
  res.json(await sales.listPrices(req.workspaceId, { query }));
}

module.exports = { getAll, getPrices, create, update, remove };
