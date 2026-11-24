const Shift = require("../models/shift.model");
const Nozzle = require("../models/nozzle.model");
const Tank = require("../models/tank.model");
const Inventory = require("../models/inventory.model");
const Transaction = require("../models/transaction.model");
const identity = require("../repositories/identity");
const StockMovement = require("../models/stockMovement.model");
const { permissionsFor } = require("../config/permissions");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const { changeStock } = require("../services/stock.service");
const { readingsFor, calculateClose, creditTotal } = require("../services/shiftMath.service");
const { buildVarianceAlert } = require("../services/messageBuilder.service");
const { enqueue } = require("../services/messageQueue.service");
const audit = require("../services/audit.service");

const DAY = 86400000;
const mayReadAll = (req) => permissionsFor(req.user.role).includes("shifts:read_all");

function shiftTransactions(shift, session) {
  return Transaction.find({ workspaceId: shift.workspaceId, shiftId: shift._id, status: "active" })
    .select("itemType quantity paymentMode amount tankChanges")
    .session(session)
    .lean();
}

async function present(shift) {
  if (!shift || shift.status !== "open") return shift;
  return { ...shift.toObject(), creditSalesTotal: creditTotal(await shiftTransactions(shift)) };
}

function readScope(req) {
  const scope = { workspaceId: req.workspaceId };
  if (!mayReadAll(req)) Object.assign(scope, { openedBy: req.user.userId, status: "open" });
  return scope;
}

async function list(req, res) {
  const filters = readScope(req);
  if (mayReadAll(req) && ["open", "closed"].includes(req.query.status))
    filters.status = req.query.status;
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const [shifts, total] = await Promise.all([
    Shift.find(filters)
      .sort({ openedAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Shift.countDocuments(filters),
  ]);
  res.json({
    shifts: await Promise.all(shifts.map(present)),
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    page,
  });
}

async function get(req, res) {
  const shift = await Shift.findOne({ ...readScope(req), _id: req.params.id });
  if (!shift) fail(404, "Shift not found");
  res.json(await present(shift));
}

async function open(req, res) {
  const { workspaceId } = req;
  let result;
  try {
    result = await writePump(req, "shifts", async ({ session }) => {
      if (await Shift.exists({ workspaceId, status: "open" }).session(session))
        fail(409, "A shift is already open");
      const nozzles = await Nozzle.find({ workspaceId, isActive: true })
        .sort({ label: 1, _id: 1 })
        .session(session);
      if (!nozzles.length) fail(409, "Register a nozzle before opening a shift");
      const input = readingsFor(req.body.nozzleReadings, nozzles);
      const nozzleReadings = nozzles.map(({ _id, tankId, itemType, label, lastMeterReading }) => ({
        nozzleId: _id,
        tankId,
        itemType,
        label,
        previousMeter: lastMeterReading,
        openingMeter: input.get(String(_id)).openingMeter,
      }));
      const mismatches = nozzleReadings.filter(
        ({ previousMeter, openingMeter }) => previousMeter !== openingMeter
      );
      if (mismatches.length && !req.body.explanation)
        fail(400, "Explain why the opening meter differs from the last reading");
      const itemTypes = [...new Set(nozzles.map(({ itemType }) => itemType))];
      const items = await Inventory.find({ workspaceId, itemType: { $in: itemTypes } }).session(
        session
      );
      if (items.length !== itemTypes.length) fail(409, "Configure inventory for each nozzle item");
      const pricesSnapshot = items.map(({ itemType, pricePerUnit }) => ({
        itemType,
        pricePerUnit,
      }));
      const shift = await new Shift({
        workspaceId,
        openedBy: req.user.userId,
        pricesSnapshot,
        nozzleReadings,
      }).save({ session });
      return { shift, mismatches };
    });
  } catch (err) {
    if (err.code === 11000) fail(409, "A shift is already open");
    throw err;
  }
  const { shift, mismatches } = result;
  await audit.record(req, {
    action: "shift.open",
    entityType: "shift",
    entityId: shift._id,
    summary: "Opened a pump shift",
  });
  if (mismatches.length) {
    await audit.record(req, {
      action: "shift.meter_override",
      entityType: "shift",
      entityId: shift._id,
      summary: "Accepted a different opening meter",
      meta: { explanation: req.body.explanation, count: mismatches.length },
    });
  }
  res.status(201).json(shift);
}

async function updateMeters(shift, readings, reopening, { session, compensate }) {
  for (const row of readings) {
    const filter = { workspaceId: shift.workspaceId, _id: row.nozzleId };
    const meter = reopening ? row.previousMeter : row.closingMeter;
    const prior = await Nozzle.findOneAndUpdate(
      filter,
      { $set: { lastMeterReading: meter } },
      { session }
    );
    if (!prior) fail(409, "A nozzle in the shift is unavailable");
    compensate(() =>
      Nozzle.updateOne(filter, { $set: { lastMeterReading: prior.lastMeterReading } })
    );
  }
}

async function applyStock(shift, effects, reopening, workspace, context) {
  const applied = [];
  for (const effect of effects) {
    const sign = reopening ? -1 : 1;
    const item = await changeStock(
      {
        filter: { workspaceId: shift.workspaceId, itemType: effect.itemType },
        delta: sign * effect.delta,
        tankChanges: effect.tankChanges.map(({ tankId, delta }) => ({
          tankId,
          delta: sign * delta,
        })),
        reason: reopening ? "shift_reopen" : "shift_sale",
        shiftId: shift._id,
        createdBy: context.userId,
        allowNegative: workspace.config?.allowNegativeStock === true,
        allowOverflow: reopening,
      },
      context
    );
    if (!item) fail(409, "Shift inventory is unavailable");
    applied.push({ ...effect, movementId: item.$locals.movementId });
  }
  return applied;
}

async function alertOwner(shift, workspace, context) {
  if (Math.abs(shift.variance) <= (workspace.config?.shiftVarianceAlertRupees ?? 500)) return;
  const recipient = await identity.getOwnerContact(shift.workspaceId);
  if (!recipient) return;
  await enqueue(
    {
      workspaceId: shift.workspaceId,
      channel: "whatsapp",
      toPhone: recipient.phone.length === 10 ? "+91" + recipient.phone : recipient.phone,
      ...buildVarianceAlert(workspace, shift.variance),
    },
    context
  );
}

async function close(req, res) {
  const { workspaceId } = req;
  const filter = { workspaceId, _id: req.params.id };
  const { shift, repeated } = await writePump(req, "shifts", async (context, workspace) => {
    const { session, compensate } = context;
    const current = await Shift.findOne(filter).session(session);
    if (!current) fail(404, "Shift not found");
    if (!mayReadAll(req) && String(current.openedBy) !== req.user.userId)
      fail(403, "You can only close your own shift");
    if (current.status === "closed") return { shift: current, repeated: true };
    const result = calculateClose({
      shift: current.toObject(),
      input: req.body,
      transactions: await shiftTransactions(current, session),
    });
    result.stockEffects = await applyStock(current, result.stockEffects, false, workspace, {
      ...context,
      userId: req.user.userId,
    });
    await updateMeters(current, result.nozzleReadings, false, context);
    const saved = await Shift.findOneAndUpdate(
      { ...filter, status: "open" },
      { $set: { ...result, status: "closed", closedAt: new Date() } },
      { new: true, session }
    );
    if (!saved) fail(409, "Shift state changed");
    compensate(() =>
      Shift.updateOne(filter, {
        $set: { status: "open", nozzleReadings: current.nozzleReadings, stockEffects: [] },
        $unset: {
          closedAt: 1,
          declaredCash: 1,
          declaredUpi: 1,
          declaredCard: 1,
          creditSalesTotal: 1,
          expectedSalesTotal: 1,
          variance: 1,
        },
      })
    );
    await alertOwner(saved, workspace, context);
    return { shift: saved, repeated: false };
  });
  if (!repeated)
    await audit.record(req, {
      action: "shift.close",
      entityType: "shift",
      entityId: shift._id,
      summary: "Closed a pump shift",
      meta: { variance: shift.variance },
    });
  res.json(shift);
}

async function reopen(req, res) {
  const { workspaceId } = req;
  const filter = { workspaceId, _id: req.params.id };
  const result = await writePump(req, "shifts", async (context, workspace) => {
    const { session, compensate } = context;
    const shift = await Shift.findOne(filter).session(session);
    if (!shift) fail(404, "Shift not found");
    if (shift.status !== "closed" || Date.now() - +shift.closedAt > DAY)
      fail(409, "Only a shift closed within 24 hours can be reopened");
    if (
      await Shift.exists({
        workspaceId,
        _id: { $ne: shift._id },
        $or: [{ status: "open" }, { openedAt: { $gte: shift.openedAt } }],
      }).session(session)
    )
      fail(409, "Only the latest shift can be reopened");
    await applyStock(shift, shift.toObject().stockEffects, true, workspace, {
      ...context,
      userId: req.user.userId,
    });
    await updateMeters(shift, shift.nozzleReadings, true, context);
    const active = await Shift.findOneAndUpdate(
      { ...filter, status: "closed" },
      {
        $set: {
          status: "open",
          reopenedAt: new Date(),
          stockEffects: [],
          nozzleReadings: shift
            .toObject()
            .nozzleReadings.map(({ closingMeter, testLitres, litresSold, ...row }) => row),
        },
        $unset: {
          closedAt: 1,
          declaredCash: 1,
          declaredUpi: 1,
          declaredCard: 1,
          creditSalesTotal: 1,
          expectedSalesTotal: 1,
          variance: 1,
        },
      },
      { session, new: true }
    );
    if (!active) fail(409, "Shift state changed");
    compensate(() =>
      Shift.updateOne(filter, {
        $set: Object.fromEntries(
          Object.entries(shift.toObject()).filter(([key]) => !["_id", "updatedAt"].includes(key))
        ),
      })
    );
    for (const { movementId } of shift.stockEffects) {
      if (!movementId) continue;
      const movementFilter = { workspaceId, _id: movementId };
      await StockMovement.updateOne(
        movementFilter,
        { $set: { reversedAt: new Date() } },
        { session }
      );
      compensate(() => StockMovement.updateOne(movementFilter, { $unset: { reversedAt: 1 } }));
    }
    return { active, variance: shift.variance };
  });
  await audit.record(req, {
    action: "shift.reopen",
    entityType: "shift",
    entityId: result.active._id,
    summary: "Reopened the latest pump shift",
    meta: { reason: req.body.reason, previousVariance: result.variance },
  });
  res.json(await present(result.active));
}

module.exports = { list, get, open, close, reopen };
