const express = require("express");
const controller = require("../controllers/customers.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { createCustomerSchema } = require("../validators/customer.schema");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.post("/", validateBody(createCustomerSchema), controller.create);
router.get("/", controller.list);
router.get("/autocomplete", controller.autocomplete);

module.exports = router;
