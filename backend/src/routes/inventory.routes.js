const express = require("express");
const inventoryController = require("../controllers/inventory.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get("/", inventoryController.getAll);
router.post("/", inventoryController.create);
router.patch("/:itemType", inventoryController.update);
router.delete("/:itemType", inventoryController.remove);

module.exports = router;
