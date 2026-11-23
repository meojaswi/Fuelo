const express = require("express");
const { requireEntitlement } = require("../middleware/entitlements.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/notifications.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get("/", requirePermission("notifications:manage"), asyncHandler(controller.list));
router.post(
  "/:id/retry",
  requirePermission("notifications:manage"),
  requireEntitlement("write"),
  asyncHandler(controller.retry)
);

module.exports = router;
