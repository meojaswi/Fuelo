const pump = require("../repositories/pump");
const { query } = require("../config/postgres");
const { permissionsFor } = require("../config/permissions");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const { roundMoney } = require("../utils/money");
const { istDayBoundsUTC } = require("../utils/datetime");
const audit = require("../services/audit.service");

const db = { query };

function canManage(req) {
  return permissionsFor(req.user.role).includes("tanks:manage");
}

function checkDip(req, workspace) {
  if (!canManage(req) && workspace.config?.attendantsCanDip !== true)
    fail(403, "Ask the owner to enable attendant dips");
}

async function targets(req, res) {
  checkDip(req, req.pumpWorkspace);
  res.json({ tanks: await pump.tankTargets(req.workspaceId) });
}

async function list(req, res) {
  const { workspaceId } = req;
  checkDip(req, req.pumpWorkspace);
  const tank = await pump.getTank(db, workspaceId, req.params.id);
  if (!tank) fail(404, "Tank not found");
  const filters = {};
  if (!canManage(req)) {
    const { startUTC, endUTC } = istDayBoundsUTC();
    Object.assign(filters, { recordedBy: req.user.userId, from: startUTC, to: endUTC });
  }
  res.json({ dips: await pump.listDips(workspaceId, tank._id, filters) });
}

async function create(req, res) {
  const { workspaceId } = req;
  const reading = await writePump(req, "tanks", async ({ db: tdb }, workspace) => {
    checkDip(req, workspace);
    const tank = await pump.getActiveTank(tdb, workspaceId, req.params.id, { lock: true });
    if (!tank) fail(404, "Tank not found");
    return pump.insertDip(tdb, workspaceId, {
      ...req.body,
      tankId: tank._id,
      recordedBy: req.user.userId,
      bookStock: tank.bookStock,
      varianceLitres: roundMoney(req.body.readingLitres - tank.bookStock),
    });
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
