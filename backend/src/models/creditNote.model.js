const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", required: true },
    invoiceNumber: { type: String, required: true },
    number: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    reason: { type: String, required: true },
    // TEMP(pg-cutover): remove when creditNote is ported
    issuedBy: { type: String, required: true },
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, transactionId: 1 }, { unique: true });
schema.index({ workspaceId: 1, number: 1 }, { unique: true });
schema.index({ workspaceId: 1, issuedAt: 1 });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("CreditNote", schema);
