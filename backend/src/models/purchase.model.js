const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: String, required: true },
    lineItems: { type: [mongoose.Schema.Types.Mixed], required: true },
    charges: { type: [mongoose.Schema.Types.Mixed], default: [] },
    total: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ["cash", "upi"] },
    status: { type: String, enum: ["active", "voided"], default: "active" },
    notes: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    voidedAt: Date,
    voidedBy: mongoose.Schema.Types.ObjectId,
    voidedReason: String,
  },
  { timestamps: true }
);

schema.index({ workspaceId: 1, supplierId: 1, invoiceNumber: 1 }, { unique: true });
schema.index({ workspaceId: 1, status: 1, invoiceDate: -1 });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("Purchase", schema);
