const express = require("express");
const inventoryController = require("../controllers/inventory.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const { validateBody } = require("../middleware/validate.middleware");
const { createInventorySchema, updateInventorySchema } = require("../validators/inventory.schema");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get("/", asyncHandler(inventoryController.getAll));
router.post("/", validateBody(createInventorySchema), asyncHandler(inventoryController.create));
router.patch(
  "/:itemType",
  validateBody(updateInventorySchema),
  asyncHandler(inventoryController.update)
);
router.delete("/:itemType", asyncHandler(inventoryController.remove));

module.exports = router;
