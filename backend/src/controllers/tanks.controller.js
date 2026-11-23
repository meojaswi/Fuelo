const Tank = require("../models/tank.model");
const Nozzle = require("../models/nozzle.model");
const Shift = require("../models/shift.model");
const Inventory = require("../models/inventory.model");
const Transaction = require("../models/transaction.model");
const Delivery = require("../models/delivery.model");
const { getVertical } = require("../config/verticals");
const { fail } = require("../services/atomic.service");
const { initializeTank } = require("../services/stock.service");
const { writePump } = require("../services/pumpWrite.service");
const audit = require("../services/audit.service");
const { roundMoney } = require("../utils/money");

async function list(req, res) {
  const tanks = await Tank.find({ workspaceId: req.workspaceId }).sort({ isActive: -1, name: 1 });
  res.json({ tanks });
}

async function create(req, res) {
  const { workspaceId } = req;
  const { name, itemType, capacityLitres } = req.body;
  let tank;
  try {
    tank = await writePump(req, "tanks", async (context, workspace) => {
      const { session, compensate } = context;
      const scope = { workspaceId, itemType };
      let item = await Inventory.findOne(scope).session(session);
      const unit =
        item?.unit ||
        workspace.config?.itemUnits?.[itemType] ||
        getVertical("fuel").items[itemType] ||
        "litres";
      if (!/^lit(re|er)s?$/i.test(unit))
        fail(400, "A physical tank requires an item measured in litres");
      if (!item) {
        item = await new Inventory({
          ...scope,
          unit: "litres",
          currentStock: 0,
          pricePerUnit: 0,
        }).save({ session });
        compensate(() => Inventory.deleteOne({ ...scope, _id: item._id }));
      }
      const alreadyTracked = await Tank.exists({ ...scope, isActive: true }).session(session);
      const opening = alreadyTracked ? 0 : item.currentStock;
      if (opening < 0) {
        fail(
          409,
          `${itemType} stock is negative. Correct the stock in Inventory, then add the tank.`
        );
      }
      if (roundMoney(opening) !== opening) {
        fail(
          409,
          `${itemType} stock (${opening} L) has more than two decimal places. Round it to two decimals in Inventory, then add the tank.`
        );
      }
      if (opening > capacityLitres) {
        fail(
          409,
          `${itemType} stock in Inventory is ${opening} L, which is more than this tank's capacity of ${capacityLitres} L. Increase the capacity to at least ${opening} L, or lower the stock in Inventory.`
        );
      }
      const entry = await new Tank({ workspaceId, name, itemType, capacityLitres }).save({
        session,
      });
      compensate(() => Tank.deleteOne({ workspaceId, _id: entry._id }));
      return initializeTank(entry, opening, item, req.user.userId, context);
    });
  } catch (err) {
    if (err.code === 11000) fail(409, "This tank name already exists");
    throw err;
  }
  await audit.record(req, {
    action: "tank.create",
    entityType: "tank",
    entityId: tank._id,
    summary: "Registered a tank",
  });
  res.status(201).json(tank);
}

async function update(req, res) {
  const filter = { workspaceId: req.workspaceId, _id: req.params.id, isActive: true };
  const tank = await writePump(req, "tanks", async ({ session }) => {
    const existing = await Tank.findOne(filter).session(session);
    if (!existing) fail(404, "Tank not found");
    if (req.body.capacityLitres !== undefined && req.body.capacityLitres < existing.bookStock) {
      fail(409, "Capacity cannot be below the book stock");
    }
    try {
      return await Tank.findOneAndUpdate(filter, { $set: req.body }, { new: true, session });
    } catch (err) {
      if (err.code === 11000) fail(409, "This tank name already exists");
      throw err;
    }
  });
  await audit.record(req, {
    action: "tank.update",
    entityType: "tank",
    entityId: tank._id,
    summary: "Updated tank details",
  });
  res.json(tank);
}

async function deactivate(req, res) {
  const { workspaceId } = req;
  const filter = { workspaceId, _id: req.params.id, isActive: true };
  const tank = await writePump(req, "tanks", async ({ session }) => {
    const existing = await Tank.findOne(filter).session(session);
    if (!existing) fail(404, "Tank not found");
    const reopenable = await Shift.exists({
      workspaceId,
      "nozzleReadings.tankId": existing._id,
      $or: [{ status: "open" }, { closedAt: { $gte: new Date(Date.now() - 86400000) } }],
    }).session(session);
    if (
      reopenable ||
      (await Nozzle.exists({ workspaceId, tankId: existing._id, isActive: true }).session(
        session
      )) ||
      existing.bookStock !== 0 ||
      (await Transaction.exists({
        workspaceId,
        status: "active",
        "tankChanges.tankId": existing._id,
      }).session(session)) ||
      (await Delivery.exists({ workspaceId, status: "active", tankId: existing._id }).session(
        session
      ))
    ) {
      fail(409, "Tank must be empty and free of active nozzles and reversible operations");
    }
    return Tank.findOneAndUpdate(
      filter,
      {
        $set: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedReason: req.body.reason,
        },
      },
      { new: true, session }
    );
  });
  await audit.record(req, {
    action: "tank.deactivate",
    entityType: "tank",
    entityId: tank._id,
    summary: "Deactivated a tank",
    meta: { reason: req.body.reason },
  });
  res.json(tank);
}

async function get(req, res) {
  const tank = await Tank.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
  if (!tank) fail(404, "Tank not found");
  res.json(tank);
}
module.exports = { list, get, create, update, deactivate };
