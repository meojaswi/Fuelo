const { randomUUID } = require("node:crypto");
const pump = require("../repositories/pump");
const { MAX_MONEY, priceForQuantity } = require("../utils/money");
const { istDayBoundsUTC } = require("../utils/datetime");
const { fail } = require("../services/atomic.service");
const { changeStock } = require("../services/stock.service");
const { writePump } = require("../services/pumpWrite.service");
const audit = require("../services/audit.service");

async function list(req, res) {
  const { from, to, date } = req.query;
  const first = date ?? from;
  const last = date ?? to;
  const window = {};
  try {
    if (first || last) {
      if (first) window.from = istDayBoundsUTC(first).startUTC;
      if (last) window.to = istDayBoundsUTC(last).endUTC;
      if (first && last && last < first) fail(400, "Date range is reversed");
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(400, "Use valid YYYY-MM-DD dates");
  }
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const { deliveries, total } = await pump.listDeliveries(req.workspaceId, window, { page, limit });
  res.json({ deliveries, page, limit, pages: Math.max(1, Math.ceil(total / limit)), total });
}

async function create(req, res) {
  const { workspaceId } = req;
  const { override, ...input } = req.body;
  const delivery = await writePump(req, "deliveries", async (context) => {
    const { db } = context;
    const tank = await pump.getActiveTank(db, workspaceId, input.tankId);
    if (!tank) fail(404, "Tank not found");
    const totalAmount = priceForQuantity(input.ratePerLitre, input.quantityLitres);
    if (!Number.isFinite(totalAmount) || totalAmount > MAX_MONEY)
      fail(400, "Delivery amount is outside the supported range");
    const id = randomUUID();
    await changeStock(
      {
        filter: { workspaceId, itemType: tank.itemType },
        delta: input.quantityLitres,
        reason: "purchase",
        deliveryId: id,
        createdBy: req.user.userId,
        tankChanges: [{ tankId: tank._id, delta: input.quantityLitres }],
        allowOverflow: override,
      },
      context
    );
    return pump.insertDelivery(db, workspaceId, {
      ...input,
      _id: id,
      itemType: tank.itemType,
      totalAmount,
      receivedBy: req.user.userId,
    });
  });
  await audit.record(req, {
    action: "delivery.create",
    entityType: "delivery",
    entityId: delivery._id,
    summary: "Recorded a tanker delivery",
    meta: { override, quantityLitres: delivery.quantityLitres },
  });
  res.status(201).json(delivery);
}

async function voidDelivery(req, res) {
  const { workspaceId } = req;
  const delivery = await writePump(req, "deliveries", async (context) => {
    const { db } = context;
    const entry = await pump.getDelivery(db, workspaceId, req.params.id, { lock: true });
    if (!entry) fail(404, "Delivery not found");
    if (entry.status !== "active") fail(409, "Delivery is already voided");
    await changeStock(
      {
        filter: { workspaceId, itemType: entry.itemType },
        delta: -entry.quantityLitres,
        reason: "delivery_void",
        deliveryId: entry._id,
        createdBy: req.user.userId,
        tankChanges: [{ tankId: entry.tankId, delta: -entry.quantityLitres }],
      },
      context
    );
    const updated = await pump.updateDelivery(
      db,
      workspaceId,
      entry._id,
      {
        status: "voided",
        voidedAt: new Date(),
        voidedBy: req.user.userId,
        voidedReason: req.body.reason,
      },
      { status: "active" }
    );
    if (!updated) fail(409, "Delivery is already voided");
    return updated;
  });
  await audit.record(req, {
    action: "delivery.void",
    entityType: "delivery",
    entityId: delivery._id,
    summary: "Voided a tanker delivery",
    meta: { reason: req.body.reason },
  });
  res.json(delivery);
}

module.exports = { list, create, voidDelivery };
