const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const notificationSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    messageJobId: { type: mongoose.Schema.Types.ObjectId, ref: "MessageJob" },

    channel: { type: String, enum: ["whatsapp", "sms"], required: true },
    status: { type: String, enum: ["sent", "failed", "pending"], required: true },
    retryCount: { type: Number, default: 0 },
    messageBody: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ workspaceId: 1, createdAt: -1 });

notificationSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Notification", notificationSchema);
