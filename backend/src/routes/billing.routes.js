const express = require("express");
const controller = require("../controllers/billing.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.post("/subscriptions", requireAuth, attachWorkspace, asyncHandler(controller.createSubscription));

// Public — Razorpay calls this directly, no user JWT. Protected by
// signature verification inside the controller instead.
router.post("/webhook", asyncHandler(controller.handleWebhook));

module.exports = router;
