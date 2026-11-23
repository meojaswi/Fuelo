const express = require("express");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/dashboard.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);
router.get(
  ["/", "/daily-summary"],
  requirePermission("dashboard:read"),
  asyncHandler(controller.getToday)
);

module.exports = router;
