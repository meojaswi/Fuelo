const router = require("express").Router();
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { requireTimber } = require("../middleware/timber.middleware");
const run = require("../middleware/asyncHandler.middleware");
const { purchase, reason } = require("../validators/timber.schema");
const controller = require("../controllers/purchases.controller");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("purchases:read"),
  requireTimber("purchases"),
  run(controller.list)
);
router.get(
  "/:id",
  requirePermission("purchases:read"),
  requireTimber("purchases"),
  run(controller.get)
);
router.post(
  "/",
  requirePermission("purchases:create"),
  requireTimber("purchases"),
  validateBody(purchase),
  run(controller.create)
);
router.post(
  "/:id/void",
  requirePermission("purchases:create"),
  requireTimber("purchases"),
  validateBody(reason),
  run(controller.voidPurchase)
);

module.exports = router;
