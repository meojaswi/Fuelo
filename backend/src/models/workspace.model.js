const { trialLimits } = require("../config/plans");
const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, unique: true },
    businessName: { type: String, required: true },
    verticalType: {
      type: String,
      required: true,
      enum: ["fuel", "timber", "construction", "kirana", "other"],
    },
    language: { type: String, enum: ["en", "hi"], default: "hi" },
    taxProfile: mongoose.Schema.Types.Mixed,
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    isActive: { type: Boolean, default: true },
    writeVersion: { type: Number, default: 0, select: false },
    trialEndsAt: { type: Date, default: () => new Date(Date.now() + 14 * 86400000) },
    planName: { type: String, default: "Trial" },
    subscriptionStatus: {
      type: String,
      enum: ["trialing", "active", "past_due", "cancelled", "expired"],
      default: "trialing",
    },
    planLimits: { type: mongoose.Schema.Types.Mixed, default: () => structuredClone(trialLimits) },
    currentPeriodEnd: Date,
    pastDueSince: Date,
    pendingSubscriptionId: String,
    currentSubscriptionId: String,
    checkoutAttempt: { type: String, select: false },
    checkoutStartedAt: Date,
    cancelAtCycleEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("Workspace", schema);
