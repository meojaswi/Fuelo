const sales = require("../repositories/sales");
const pump = require("../repositories/pump");
const { query } = require("../config/postgres");
const { getVertical } = require("../config/verticals");
const { fail } = require("../services/atomic.service");
const { initializeTank } = require("../services/stock.service");
const { writePump } = require("../services/pumpWrite.service");
const audit = require("../services/audit.service");
const { roundMoney } = require("../utils/money");

const db = { query };

async function list(req, res) {
  res.json({ tanks: await pump.listTanks(req.workspaceId) });
}

async function create(req, res) {
  const { workspaceId } = req;
  const { name, itemType, capacityLitres } = req.body;
  let tank;
  try {
    tank = await writePump(req, "tanks", async (context, workspace) => {
      const { db: tdb } = context;
      let item = await sales.getInventoryItem(tdb, workspaceId, itemType, { lock: true });
      const unit =
        item?.unit ||
        workspace.config?.itemUnits?.[itemType] ||
        getVertical("fuel").items[itemType] ||
        "litres";
      if (!/^lit(re|er)s?$/i.test(unit))
        fail(400, "A physical tank requires an item measured in litres");
      item ??= await sales.insertInventory(tdb, workspaceId, {
        itemType,
        unit: "litres",
        currentStock: 0,
        pricePerUnit: 0,
      });
      const alreadyTracked = await pump.hasTanks(tdb, workspaceId, itemType, { activeOnly: true });
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
      const entry = await pump.insertTank(tdb, workspaceId, { name, itemType, capacityLitres });
      return initializeTank(entry, opening, item, req.user.userId, context);
    });
  } catch (err) {
    if (err.code === "23505") fail(409, "This tank name already exists");
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
  const { workspaceId } = req;
  const tank = await writePump(req, "tanks", async ({ db: tdb }) => {
    const existing = await pump.getActiveTank(tdb, workspaceId, req.params.id, { lock: true });
    if (!existing) fail(404, "Tank not found");
    if (req.body.capacityLitres !== undefined && req.body.capacityLitres < existing.bookStock) {
      fail(409, "Capacity cannot be below the book stock");
    }
    try {
      return await pump.updateTank(tdb, workspaceId, existing._id, req.body);
    } catch (err) {
      if (err.code === "23505") fail(409, "This tank name already exists");
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
  const tank = await writePump(req, "tanks", async ({ db: tdb }) => {
    const existing = await pump.getActiveTank(tdb, workspaceId, req.params.id, { lock: true });
    if (!existing) fail(404, "Tank not found");
    if (existing.bookStock !== 0 || (await pump.tankIsBusy(tdb, workspaceId, existing._id))) {
      fail(409, "Tank must be empty and free of active nozzles and reversible operations");
    }
    return pump.updateTank(tdb, workspaceId, existing._id, {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedReason: req.body.reason,
    });
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
  const tank = await pump.getTank(db, req.workspaceId, req.params.id);
  if (!tank) fail(404, "Tank not found");
  res.json(tank);
}
module.exports = { list, get, create, update, deactivate };
