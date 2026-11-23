const express = require("express");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/summary.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);
router.get("/", requirePermission("reports:read"), asyncHandler(controller.getByDate));

module.exports = router;
