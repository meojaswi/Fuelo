const express = require("express");
const controller = require("../controllers/transactions.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const {
  createTransactionSchema,
  voidTransactionSchema,
} = require("../validators/transaction.schema");

const linksController = require("../controllers/links.controller");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.post("/", validateBody(createTransactionSchema), asyncHandler(controller.create));
router.get("/", asyncHandler(controller.list));
router.post("/:id/void", validateBody(voidTransactionSchema), asyncHandler(controller.voidSale));
router.post("/:id/share-link", asyncHandler(linksController.create));
router.get("/:id", asyncHandler(controller.getById));
router.get("/:id/receipt.pdf", asyncHandler(controller.getReceiptPdf));

module.exports = router;
