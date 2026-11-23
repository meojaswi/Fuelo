const router = require("express").Router();
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { requireTimber } = require("../middleware/timber.middleware");
const run = require("../middleware/asyncHandler.middleware");
const { supplier, supplierEdit, payment, reason } = require("../validators/timber.schema");
const controller = require("../controllers/suppliers.controller");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("suppliers:manage"),
  requireTimber("suppliers"),
  run(controller.list)
);
router.get(
  "/outstanding",
  requirePermission("payables:read"),
  requireTimber("suppliers"),
  run(controller.outstanding)
);
router.get(
  "/:id",
  requirePermission("suppliers:manage"),
  requireTimber("suppliers"),
  run(controller.get)
);
router.get(
  "/:id/ledger",
  requirePermission("payables:read"),
  requireTimber("suppliers"),
  run(controller.ledger)
);
router.post(
  "/",
  requirePermission("suppliers:manage"),
  requireTimber("suppliers"),
  validateBody(supplier),
  run(controller.create)
);
router.patch(
  "/:id",
  requirePermission("suppliers:manage"),
  requireTimber("suppliers"),
  validateBody(supplierEdit),
  run(controller.update)
);
router.delete(
  "/:id",
  requirePermission("suppliers:manage"),
  requireTimber("suppliers"),
  validateBody(reason),
  run(controller.deactivate)
);
router.post(
  "/:id/payments",
  requirePermission("payables:payment"),
  requireTimber("suppliers"),
  validateBody(payment),
  run(controller.pay)
);

module.exports = router;
