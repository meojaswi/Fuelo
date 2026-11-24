const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    type: {
      type: String,
      enum: ["credit_sale", "payment", "adjustment", "void_reversal"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    // A debit increases what the customer owes; a credit reduces it.
    direction: { type: String, enum: ["debit", "credit"], required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    paymentMode: { type: String, enum: ["cash", "upi", "credit"] },
    upiReference: String,
    note: String,
    // TEMP(pg-cutover): remove when ledgerEntry is ported
    createdBy: { type: String, ref: "UserAccount", required: true },
    affectsBalance: { type: Boolean, default: true },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ workspaceId: 1, customerId: 1, createdAt: -1, _id: -1 });
schema.index({ workspaceId: 1, customerId: 1, type: 1, createdAt: -1 });
schema.index(
  { workspaceId: 1, transactionId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionId: { $exists: true } },
  }
);
schema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("LedgerEntry", schema);
