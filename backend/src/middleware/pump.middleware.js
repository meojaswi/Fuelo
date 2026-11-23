const Workspace = require("../models/workspace.model");
const { getVertical } = require("../config/verticals");
const { caps, assertCan, EntitlementError } = require("../services/entitlements.service");
const { fail } = require("../services/atomic.service");
const asyncHandler = require("./asyncHandler.middleware");

function checkPump(workspace, feature) {
  if (!workspace) fail(404, "Workspace not found");
  if (!getVertical(workspace.verticalType).flags[feature])
    fail(404, "This feature is unavailable for this workspace type");
  if (!caps(workspace).features?.pumpPack) {
    throw new EntitlementError(
      "FEATURE_NOT_IN_PLAN",
      "The pump pack is unavailable on the current plan."
    );
  }
}

function requirePump(feature, write = false) {
  return asyncHandler(async (req, res, next) => {
    const workspace = await Workspace.findOne({ workspaceId: req.workspaceId, isActive: true });
    checkPump(workspace, feature);
    if (write) await assertCan(req.workspaceId, "write", { workspace });
    req.pumpWorkspace = workspace;
    next();
  });
}

module.exports = { requirePump, checkPump };
