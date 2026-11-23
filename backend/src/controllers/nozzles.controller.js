const Nozzle = require("../models/nozzle.model");
const Tank = require("../models/tank.model");
const Shift = require("../models/shift.model");
const { writePump } = require("../services/pumpWrite.service");
const { fail } = require("../services/atomic.service");
const audit = require("../services/audit.service");

async function list(req, res) {
  const nozzles = await Nozzle.find({ workspaceId: req.workspaceId, isActive: true }).sort({
    label: 1,
  });
  res.json({ nozzles });
}

async function save(req, res, action) {
  const { workspaceId } = req;
  let result;
  try {
    result = await writePump(req, "shifts", async ({ session }) => {
      if (await Shift.exists({ workspaceId, status: "open" }).session(session))
        fail(409, "Close the shift before changing nozzles");
      if (action === "create") {
        const tank = await Tank.findOne({
          workspaceId,
          _id: req.body.tankId,
          isActive: true,
        }).session(session);
        if (!tank) fail(404, "Tank not found");
        return new Nozzle({ ...req.body, workspaceId, itemType: tank.itemType }).save({ session });
      }
      const scope = { workspaceId, _id: req.params.id, isActive: true };
      const changes =
        action === "deactivate"
          ? { isActive: false, deactivatedAt: new Date(), deactivatedReason: req.body.reason }
          : req.body;
      const nozzle = await Nozzle.findOneAndUpdate(
        scope,
        { $set: changes },
        { new: true, session }
      );
      if (!nozzle) fail(404, "Nozzle not found");
      return nozzle;
    });
  } catch (err) {
    if (err.code === 11000) fail(409, "This nozzle label already exists");
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
