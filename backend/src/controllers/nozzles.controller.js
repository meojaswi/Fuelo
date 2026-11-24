const pump = require("../repositories/pump");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const audit = require("../services/audit.service");

async function list(req, res) {
  res.json({ nozzles: await pump.listActiveNozzles(req.workspaceId) });
}

async function save(req, res, action) {
  const { workspaceId } = req;
  let result;
  try {
    result = await writePump(req, "shifts", async ({ db }) => {
      if (await pump.getOpenShift(db, workspaceId)) fail(409, "Close the shift before changing nozzles");
      if (action === "create") {
        const tank = await pump.getActiveTank(db, workspaceId, req.body.tankId);
        if (!tank) fail(404, "Tank not found");
        return pump.insertNozzle(db, workspaceId, { ...req.body, itemType: tank.itemType });
      }
      const changes =
        action === "deactivate"
          ? { isActive: false, deactivatedAt: new Date(), deactivatedReason: req.body.reason }
          : req.body;
      const nozzle = await pump.updateActiveNozzle(db, workspaceId, req.params.id, changes);
      if (!nozzle) fail(404, "Nozzle not found");
      return nozzle;
    });
  } catch (err) {
    if (err.code === "23505") fail(409, "This nozzle label already exists");
    throw err;
  }
  await audit.record(req, {
    action: "nozzle." + action,
    entityType: "nozzle",
    entityId: result._id,
    summary: "Updated nozzle configuration",
    meta: { reason: req.body.reason },
  });
  res.status(action === "create" ? 201 : 200).json(result);
}

module.exports = {
  list,
  create: (req, res) => save(req, res, "create"),
  update: (req, res) => save(req, res, "update"),
  deactivate: (req, res) => save(req, res, "deactivate"),
};
