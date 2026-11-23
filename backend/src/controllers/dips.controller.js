const Tank = require("../models/tank.model");
const DipReading = require("../models/dipReading.model");
const { permissionsFor } = require("../config/permissions");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const { roundMoney } = require("../utils/money");
const { istDayBoundsUTC } = require("../utils/datetime");
const audit = require("../services/audit.service");

function canManage(req) {
  return permissionsFor(req.user.role).includes("tanks:manage");
}

function checkDip(req, workspace) {
  if (!canManage(req) && workspace.config?.attendantsCanDip !== true)
    fail(403, "Ask the owner to enable attendant dips");
}

async function targets(req, res) {
  checkDip(req, req.pumpWorkspace);
  const tanks = await Tank.find({ workspaceId: req.workspaceId, isActive: true })
    .select("name itemType capacityLitres")
    .sort({ name: 1 });
  res.json({ tanks });
}

async function list(req, res) {
  const { workspaceId } = req;
  checkDip(req, req.pumpWorkspace);
  const tank = await Tank.findOne({ workspaceId, _id: req.params.id });
  if (!tank) fail(404, "Tank not found");
  const filters = { workspaceId, tankId: tank._id };
  if (!canManage(req)) {
    const { startUTC, endUTC } = istDayBoundsUTC();
    Object.assign(filters, {
      recordedBy: req.user.userId,
      recordedAt: { $gte: startUTC, $lt: endUTC },
    });
  }
  const dips = await DipReading.find(filters).sort({ recordedAt: -1, _id: -1 }).limit(50);
  res.json({ dips });
}

async function create(req, res) {
  const { workspaceId } = req;
  const reading = await writePump(req, "tanks", async ({ session }, workspace) => {
    checkDip(req, workspace);
    const tank = await Tank.findOne({ workspaceId, _id: req.params.id, isActive: true }).session(
      session
    );
    if (!tank) fail(404, "Tank not found");
    return new DipReading({
      ...req.body,
      workspaceId,
      tankId: tank._id,
      recordedBy: req.user.userId,
      bookStock: tank.bookStock,
      varianceLitres: roundMoney(req.body.readingLitres - tank.bookStock),
    }).save({ session });
  });
  await audit.record(req, {
    action: "tank.dip",
    entityType: "tank",
    entityId: req.params.id,
    summary: "Recorded a tank dip",
    meta: { varianceLitres: reading.varianceLitres },
  });
  res.status(201).json(reading);
}

module.exports = { targets, list, create };
