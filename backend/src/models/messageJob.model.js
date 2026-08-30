const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

// A transaction POST enqueues a job here instead of calling Twilio inline.
// A drain tick (messageQueue.service.js) picks these up. This decouples
// request latency from Twilio's response time and gives retries + an audit
// trail for free.
const messageJobSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },

    channel: { type: String, enum: ["whatsapp", "sms"], required: true },
    toPhone: { type: String, required: true },
    body: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String },
    providerMessageSid: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true }
);

messageJobSchema.index({ status: 1, createdAt: 1 });

messageJobSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("MessageJob", messageJobSchema);
