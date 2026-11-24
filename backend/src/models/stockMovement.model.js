const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    itemType: { type: String, required: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        "sale",
        "void",
        "manual_adjust",
        "purchase",
        "shift_sale",
        "shift_reopen",
        "delivery_void",
        "purchase_void",
      ],
      required: true,
    },
    piecesDelta: Number,
    piecesAfter: Number,
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, ref: "Delivery" },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift" },
    reversedAt: Date,
    tankChanges: [
      {
        _id: false,
        tankId: { type: mongoose.Schema.Types.ObjectId, ref: "Tank" },
        delta: Number,
        balanceAfter: Number,
      },
    ],
    // TEMP(pg-cutover): remove when stockMovement is ported
    createdBy: { type: String, ref: "UserAccount", required: true },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ workspaceId: 1, itemType: 1, createdAt: -1 });
schema.index({ workspaceId: 1, createdAt: 1, "tankChanges.tankId": 1 });
schema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("StockMovement", schema);
