const { assertCan } = require("../services/entitlements.service");
const asyncHandler = require("./asyncHandler.middleware");

const requireEntitlement = (action) =>
  asyncHandler(async (req, res, next) => {
    await assertCan(req.workspaceId, action);
    next();
  });

module.exports = { requireEntitlement };
