const mongoose = require("mongoose");

// Stores the provider's event ID before processing. A retried webhook
// (Razorpay and Twilio both retry on non-2xx or timeout) hits the unique
// index and is treated as already-handled instead of double-firing a
// revenue split or flipping a notification status twice.
const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["razorpay", "twilio"], required: true },
    eventId: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
