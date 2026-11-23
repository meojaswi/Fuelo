const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },
    type: {
      type: String,
      enum: ["purchase", "payment", "adjustment", "void_reversal"],
      required: true,
    },
    direction: { type: String, enum: ["debit", "credit"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    effectiveAt: Date,
    paymentMode: { type: String, enum: ["cash", "upi"] },
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ workspaceId: 1, supplierId: 1, createdAt: -1, _id: -1 });
schema.index(
  { workspaceId: 1, purchaseId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { purchaseId: { $exists: true } },
  }
);
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("SupplierLedgerEntry", schema);
