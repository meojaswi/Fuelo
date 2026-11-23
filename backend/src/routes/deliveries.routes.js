const router = require("express").Router();
const controller = require("../controllers/deliveries.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { requirePump } = require("../middleware/pump.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");
const { delivery, reason } = require("../validators/pump.schema");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("deliveries:read"),
  requirePump("deliveries"),
  asyncHandler(controller.list)
);
router.post(
  "/",
  requirePermission("deliveries:create"),
  validateBody(delivery),
  asyncHandler(controller.create)
);
router.post(
  "/:id/void",
  requirePermission("deliveries:create"),
  validateBody(reason),
  asyncHandler(controller.voidDelivery)
);
module.exports = router;
