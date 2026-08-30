const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

// Not workspace-scoped — plans are global, so no plugin applied here.
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // "Starter", "Growth", "Business"
    billingCycle: { type: String, enum: ["monthly", "yearly"], required: true },
    priceInPaise: { type: Number, required: true },
    transactionCap: { type: Number }, // null = unlimited
    razorpayPlanId: { type: String, required: true },
  },
  { timestamps: true }
);

const workspaceSubscriptionSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    razorpaySubscriptionId: { type: String, required: true },
    status: {
      type: String,
      enum: ["created", "active", "halted", "cancelled", "completed"],
      default: "created",
    },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true }
);
workspaceSubscriptionSchema.plugin(requireWorkspaceScope);

// Kirti's revenue-share account, linked via Razorpay Route for auto-splits
// on referred workspaces' subscription charges.
const linkedRevenueAccountSchema = new mongoose.Schema(
  {
    ownerName: { type: String, required: true }, // e.g. "Kirti Jha"
    razorpayAccountId: { type: String, required: true },
    sharePercent: { type: Number, required: true }, // e.g. 30
    // Workspaces this account earns a share on — the referral attribution.
    referredWorkspaceIds: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = {
  SubscriptionPlan: mongoose.model("SubscriptionPlan", subscriptionPlanSchema),
  WorkspaceSubscription: mongoose.model("WorkspaceSubscription", workspaceSubscriptionSchema),
  LinkedRevenueAccount: mongoose.model("LinkedRevenueAccount", linkedRevenueAccountSchema),
};
