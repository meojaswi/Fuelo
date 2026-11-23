const express = require("express");
const { requireEntitlement } = require("../middleware/entitlements.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/customers.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const {
  createCustomerSchema,
  updateCustomerSchema,
  paymentSchema,
} = require("../validators/customer.schema");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.post(
  "/",
  validateBody(createCustomerSchema),
  requirePermission("customers:manage"),
  requireEntitlement("write"),
  asyncHandler(controller.create)
);
router.get("/", requirePermission("customers:manage"), asyncHandler(controller.list));
router.get(
  "/autocomplete",
  requirePermission("customers:lookup"),
  asyncHandler(controller.autocomplete)
);

router.get("/outstanding", requirePermission("credit:read"), asyncHandler(controller.outstanding));
router.get("/:id", requirePermission("credit:read"), asyncHandler(controller.getById));
router.get("/:id/ledger", requirePermission("credit:read"), asyncHandler(controller.ledger));
router.post(
  "/:id/payments",
  validateBody(paymentSchema),
  requirePermission("credit:payment"),
  asyncHandler(controller.recordPayment)
);
router.patch(
  "/:id",
  validateBody(updateCustomerSchema),
  requirePermission("customers:manage"),
  requireEntitlement("write"),
  asyncHandler(controller.update)
);

router.post("/:id/reminder", requirePermission("credit:reminder"), asyncHandler(controller.remind));

module.exports = router;
