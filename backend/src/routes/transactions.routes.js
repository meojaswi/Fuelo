const express = require("express");
const { requireEntitlement } = require("../middleware/entitlements.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/transactions.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const {
  createTransactionSchema,
  voidTransactionSchema,
} = require("../validators/transaction.schema");

const { timberSale } = require("../validators/timber.schema");
const validateLegacySale = validateBody(createTransactionSchema);
const validateTimberSale = validateBody(timberSale);

function validateSale(req, res, next) {
  const validate =
    req.body && Object.hasOwn(req.body, "lineItems") ? validateTimberSale : validateLegacySale;
  return validate(req, res, next);
}

const linksController = require("../controllers/links.controller");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.post(
  "/",
  validateSale,
  requirePermission("transactions:create"),
  asyncHandler(controller.create)
);
router.get("/", requirePermission("transactions:read"), asyncHandler(controller.list));
router.post(
  "/:id/void",
  validateBody(voidTransactionSchema),
  requirePermission("transactions:void"),
  asyncHandler(controller.voidSale)
);
router.post(
  "/:id/share-link",
  requirePermission("transactions:read"),
  asyncHandler(linksController.create)
);
router.get("/:id", requirePermission("transactions:read"), asyncHandler(controller.getById));
router.get(
  "/:id/receipt.pdf",
  requirePermission("transactions:read"),
  requireEntitlement("feature:pdfReceipts"),
  asyncHandler(controller.getReceiptPdf)
);

module.exports = router;
