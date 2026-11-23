const express = require("express");
const { requireEntitlement } = require("../middleware/entitlements.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const inventoryController = require("../controllers/inventory.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const { validateBody } = require("../middleware/validate.middleware");
const { createInventorySchema, updateInventorySchema } = require("../validators/inventory.schema");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get(
  "/prices",
  requirePermission("transactions:create"),
  asyncHandler(inventoryController.getPrices)
);
router.get("/", requirePermission("inventory:read"), asyncHandler(inventoryController.getAll));
router.post(
  "/",
  validateBody(createInventorySchema),
  requirePermission("inventory:write"),
  requireEntitlement("write"),
  asyncHandler(inventoryController.create)
);
router.patch(
  "/:itemType",
  validateBody(updateInventorySchema),
  requirePermission("inventory:write"),
  requireEntitlement("write"),
  asyncHandler(inventoryController.update)
);
router.delete(
  "/:itemType",
  requirePermission("inventory:write"),
  requireEntitlement("write"),
  asyncHandler(inventoryController.remove)
);

module.exports = router;
