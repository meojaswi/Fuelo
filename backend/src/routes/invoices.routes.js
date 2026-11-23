const router = require("express").Router();
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { requireTimber } = require("../middleware/timber.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const run = require("../middleware/asyncHandler.middleware");
const { reason } = require("../validators/timber.schema");
const controller = require("../controllers/invoices.controller");

router.use(requireAuth, attachWorkspace);
router.get("/", requirePermission("invoices:read"), requireTimber("gst"), run(controller.list));
router.get("/:id", requirePermission("invoices:read"), requireTimber("gst"), run(controller.get));
router.get(
  "/:id/pdf",
  requirePermission("invoices:read"),
  requireTimber("gst"),
  run(controller.download)
);
router.post(
  "/:id/credit-note",
  requirePermission("invoices:credit_note"),
  requireTimber("gst"),
  validateBody(reason),
  run(controller.makeCreditNote)
);

module.exports = router;
