const sales = require("../repositories/sales");
const pump = require("../repositories/pump");
const identity = require("../repositories/identity");
const { query } = require("../config/postgres");
const { permissionsFor } = require("../config/permissions");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const { changeStock } = require("../services/stock.service");
const { readingsFor, calculateClose, creditTotal } = require("../services/shiftMath.service");
const { buildVarianceAlert } = require("../services/messageBuilder.service");
const { enqueue } = require("../services/messageQueue.service");
const audit = require("../services/audit.service");

const DAY = 86400000;
const db = { query };
const mayReadAll = (req) => permissionsFor(req.user.role).includes("shifts:read_all");

async function present(shift) {
  if (!shift || shift.status !== "open") return shift;
  const open = await sales.shiftSales(db, shift.workspaceId, shift._id);
  return { ...shift, creditSalesTotal: creditTotal(open) };
}

// Attendants can only see the shift they have open.
function readScope(req) {
  return mayReadAll(req) ? {} : { openedBy: req.user.userId, status: "open" };
}

async function list(req, res) {
  const filters = readScope(req);
  if (mayReadAll(req) && ["open", "closed"].includes(req.query.status))
    filters.status = req.query.status;
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const { shifts, total } = await pump.listShifts(req.workspaceId, filters, { page, limit });
  res.json({
    shifts: await Promise.all(shifts.map(present)),
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
    page,
  });
}

async function get(req, res) {
  const shift = await pump.getShift(db, req.workspaceId, req.params.id, readScope(req));
  if (!shift) fail(404, "Shift not found");
  res.json(await present(shift));
}

async function open(req, res) {
  const { workspaceId } = req;
  let result;
  try {
    result = await writePump(req, "shifts", async ({ db: tdb }) => {
      if (await pump.getOpenShift(tdb, workspaceId)) fail(409, "A shift is already open");
      const nozzles = await pump.listActiveNozzles(workspaceId, tdb, { lock: true });
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
      const items = await sales.getInventoryItems(tdb, workspaceId, itemTypes);
      if (items.length !== itemTypes.length) fail(409, "Configure inventory for each nozzle item");
      const pricesSnapshot = items.map(({ itemType, pricePerUnit }) => ({
        itemType,
        pricePerUnit,
      }));
      const shift = await pump.insertShift(tdb, workspaceId, {
        openedBy: req.user.userId,
        pricesSnapshot,
        nozzleReadings,
      });
      return { shift, mismatches };
    });
  } catch (err) {
    if (err.code === "23505") fail(409, "A shift is already open");
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

async function updateMeters(shift, readings, reopening, { db: tdb }) {
  for (const row of readings) {
    const meter = reopening ? row.previousMeter : row.closingMeter;
    if (!(await pump.setMeter(tdb, shift.workspaceId, row.nozzleId, meter)))
      fail(409, "A nozzle in the shift is unavailable");
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
    applied.push({ ...effect, movementId: item.movementId });
  }
  return applied;
}

async function alertOwner(shift, workspace, context) {
  if (Math.abs(shift.variance) <= (workspace.config?.shiftVarianceAlertRupees ?? 500)) return;
  const recipient = await identity.getOwnerContact(shift.workspaceId, context.db);
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

const clearedClose = {
  closedAt: null,
  declaredCash: null,
  declaredUpi: null,
  declaredCard: null,
  creditSalesTotal: null,
  expectedSalesTotal: null,
  variance: null,
};

async function close(req, res) {
  const { workspaceId } = req;
  const { shift, repeated } = await writePump(req, "shifts", async (context, workspace) => {
    const { db: tdb } = context;
    const current = await pump.getShift(tdb, workspaceId, req.params.id, { lock: true });
    if (!current) fail(404, "Shift not found");
    if (!mayReadAll(req) && current.openedBy !== req.user.userId)
      fail(403, "You can only close your own shift");
    if (current.status === "closed") return { shift: current, repeated: true };
    const result = calculateClose({
      shift: current,
      input: req.body,
      transactions: await sales.shiftSales(tdb, workspaceId, current._id),
    });
    result.stockEffects = await applyStock(current, result.stockEffects, false, workspace, {
      ...context,
      userId: req.user.userId,
    });
    await updateMeters(current, result.nozzleReadings, false, context);
    const saved = await pump.updateShift(
      tdb,
      workspaceId,
      current._id,
      { ...result, status: "closed", closedAt: new Date() },
      { status: "open" }
    );
    if (!saved) fail(409, "Shift state changed");
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
  const result = await writePump(req, "shifts", async (context, workspace) => {
    const { db: tdb } = context;
    const shift = await pump.getShift(tdb, workspaceId, req.params.id, { lock: true });
    if (!shift) fail(404, "Shift not found");
    if (shift.status !== "closed" || Date.now() - +shift.closedAt > DAY)
      fail(409, "Only a shift closed within 24 hours can be reopened");
    if (await pump.hasNewerShift(tdb, workspaceId, shift))
      fail(409, "Only the latest shift can be reopened");
    await applyStock(shift, shift.stockEffects, true, workspace, {
      ...context,
      userId: req.user.userId,
    });
    await updateMeters(shift, shift.nozzleReadings, true, context);
    const active = await pump.updateShift(
      tdb,
      workspaceId,
      shift._id,
      {
        ...clearedClose,
        status: "open",
        reopenedAt: new Date(),
        stockEffects: [],
        nozzleReadings: shift.nozzleReadings.map(
          ({ closingMeter, testLitres, litresSold, ...row }) => row
        ),
      },
      { status: "closed" }
    );
    if (!active) fail(409, "Shift state changed");
    for (const { movementId } of shift.stockEffects) {
      if (movementId) await sales.markMovementReversed(tdb, workspaceId, movementId);
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
