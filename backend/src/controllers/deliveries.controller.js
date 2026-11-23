const Delivery = require("../models/delivery.model");
const Tank = require("../models/tank.model");
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
  const filter = { workspaceId: req.workspaceId };
  try {
    if (first || last) {
      filter.receivedAt = {
        ...(first && { $gte: istDayBoundsUTC(first).startUTC }),
        ...(last && { $lt: istDayBoundsUTC(last).endUTC }),
      };
      if (first && last && last < first) fail(400, "Date range is reversed");
    }
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(400, "Use valid YYYY-MM-DD dates");
  }
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const [deliveries, total] = await Promise.all([
    Delivery.find(filter)
      .sort({ receivedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Delivery.countDocuments(filter),
  ]);
  res.json({ deliveries, page, limit, pages: Math.max(1, Math.ceil(total / limit)), total });
}

async function create(req, res) {
  const { workspaceId } = req;
  const { override, ...input } = req.body;
  const delivery = await writePump(req, "deliveries", async (context) => {
    const { session, compensate } = context;
    const tank = await Tank.findOne({ workspaceId, _id: input.tankId, isActive: true }).session(
      session
    );
    if (!tank) fail(404, "Tank not found");
    const totalAmount = priceForQuantity(input.ratePerLitre, input.quantityLitres);
    if (!Number.isFinite(totalAmount) || totalAmount > MAX_MONEY)
      fail(400, "Delivery amount is outside the supported range");
    const entry = new Delivery({
      ...input,
      workspaceId,
      itemType: tank.itemType,
      totalAmount,
      receivedBy: req.user.userId,
    });
    await changeStock(
      {
        filter: { workspaceId, itemType: tank.itemType },
        delta: entry.quantityLitres,
        reason: "purchase",
        deliveryId: entry._id,
        createdBy: req.user.userId,
        tankChanges: [{ tankId: tank._id, delta: entry.quantityLitres }],
        allowOverflow: override,
      },
      context
    );
    await entry.save({ session });
    compensate(() => Delivery.deleteOne({ workspaceId, _id: entry._id }));
    return entry;
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
  const filter = { workspaceId, _id: req.params.id };
  const delivery = await writePump(req, "deliveries", async (context) => {
    const { session, compensate } = context;
    const entry = await Delivery.findOne(filter).session(session);
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
    const updated = await Delivery.findOneAndUpdate(
      { ...filter, status: "active" },
      {
        $set: {
          status: "voided",
          voidedAt: new Date(),
          voidedBy: req.user.userId,
          voidedReason: req.body.reason,
        },
      },
      { new: true, session }
    );
    if (!updated) fail(409, "Delivery is already voided");
    compensate(() =>
      Delivery.updateOne(filter, {
        $set: { status: "active" },
        $unset: { voidedAt: 1, voidedBy: 1, voidedReason: 1 },
      })
    );
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
