const express = require("express");
const controller = require("../controllers/transactions.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { createTransactionSchema } = require("../validators/transaction.schema");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.post("/", validateBody(createTransactionSchema), controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.get("/:id/receipt.pdf", controller.getReceiptPdf);

module.exports = router;
