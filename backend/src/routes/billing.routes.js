const express = require("express");
const { requirePermission } = require("../middleware/permission.middleware");
const controller = require("../controllers/billing.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.get(
  "/status",
  requireAuth,
  attachWorkspace,
  requirePermission("billing:manage"),
  asyncHandler(controller.status)
);
router.post(
  "/cancel",
  requireAuth,
  attachWorkspace,
  requirePermission("billing:manage"),
  asyncHandler(controller.cancel)
);
router.post(
  "/subscriptions",
  requireAuth,
  attachWorkspace,
  requirePermission("billing:manage"),
  asyncHandler(controller.createSubscription)
);

// Public — Razorpay calls this directly, no user JWT. Protected by
// signature verification inside the controller instead.
router.post("/webhook", asyncHandler(controller.handleWebhook));

module.exports = router;
