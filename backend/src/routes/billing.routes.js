const express = require("express");
const controller = require("../controllers/billing.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.post("/subscriptions", requireAuth, attachWorkspace, controller.createSubscription);

// Public — Razorpay calls this directly, no user JWT. Protected by
// signature verification inside the controller instead.
router.post("/webhook", controller.handleWebhook);

module.exports = router;
