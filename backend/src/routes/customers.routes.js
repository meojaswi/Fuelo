const express = require("express");
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

router.post("/", validateBody(createCustomerSchema), asyncHandler(controller.create));
router.get("/", asyncHandler(controller.list));
router.get("/autocomplete", asyncHandler(controller.autocomplete));

router.get("/outstanding", asyncHandler(controller.outstanding));
router.get("/:id", asyncHandler(controller.getById));
router.get("/:id/ledger", asyncHandler(controller.ledger));
router.post("/:id/payments", validateBody(paymentSchema), asyncHandler(controller.recordPayment));
router.patch("/:id", validateBody(updateCustomerSchema), asyncHandler(controller.update));

module.exports = router;
