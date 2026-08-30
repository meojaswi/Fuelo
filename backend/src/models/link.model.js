const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Link", linkSchema);
