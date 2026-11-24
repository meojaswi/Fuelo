const identity = require("../repositories/identity");
const { getVertical } = require("../config/verticals");
const { caps, EntitlementError } = require("../services/entitlements.service");
const { fail } = require("../services/atomic.service");
const asyncHandler = require("./asyncHandler.middleware");

function checkTimber(workspace, feature) {
  if (!workspace) fail(404, "Workspace not found");
  if (!getVertical(workspace.verticalType).flags[feature])
    fail(404, "This feature is unavailable for this workspace type");
  if (!caps(workspace).features?.timberPack)
    throw new EntitlementError(
      "FEATURE_NOT_IN_PLAN",
      "The timber pack is unavailable on the current plan."
    );
}

function requireTimber(feature) {
  return asyncHandler(async (req, res, next) => {
    req.timberWorkspace = await identity.getWorkspace(req.workspaceId);
    checkTimber(req.timberWorkspace, feature);
    next();
  });
}

module.exports = { checkTimber, requireTimber };
