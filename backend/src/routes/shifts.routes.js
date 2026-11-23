const router = require("express").Router();
const controller = require("../controllers/shifts.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { requirePump } = require("../middleware/pump.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");
const { openShift, closeShift, reason } = require("../validators/pump.schema");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("shifts:operate"),
  requirePump("shifts"),
  asyncHandler(controller.list)
);
router.get(
  "/:id",
  requirePermission("shifts:operate"),
  requirePump("shifts"),
  asyncHandler(controller.get)
);
router.post(
  "/open",
  requirePermission("shifts:operate"),
  validateBody(openShift),
  asyncHandler(controller.open)
);
router.post(
  "/:id/close",
  requirePermission("shifts:operate"),
  validateBody(closeShift),
  asyncHandler(controller.close)
);
router.post(
  "/:id/reopen",
  requirePermission("shifts:reopen"),
  validateBody(reason),
  asyncHandler(controller.reopen)
);
module.exports = router;
