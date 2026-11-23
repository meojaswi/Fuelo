const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    itemType: { type: String, required: true },
    delta: { type: Number, required: true },
    reason: { type: String, enum: ["sale", "void", "manual_adjust", "purchase"], required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Dealer", required: true },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ workspaceId: 1, itemType: 1, createdAt: -1 });
schema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("StockMovement", schema);
