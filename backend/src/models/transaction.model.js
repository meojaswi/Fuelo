const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const transactionSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },

    // Generic enough to cover fuel type / timber grade / material category
    // across verticals — the label set comes from Dealer.config, not here.
    itemType: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true }, // litres, cubic ft, bags, etc.
    amount: { type: Number, required: true },

    paymentMode: { type: String, enum: ["cash", "upi", "credit"], required: true },
    upiReference: { type: String }, // manual RRN entry, v1 approach

    notes: { type: String },
    status: { type: String, enum: ["active", "voided"], default: "active" },
  },
  { timestamps: true }
);

// workspaceId leading every compound index — enforces tenant isolation at
// the query-plan level, not just at the route layer.
transactionSchema.index({ workspaceId: 1, createdAt: -1 });
transactionSchema.index({ workspaceId: 1, customerPhone: 1 });
transactionSchema.index({ workspaceId: 1, paymentMode: 1, createdAt: -1 });

transactionSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Transaction", transactionSchema);
