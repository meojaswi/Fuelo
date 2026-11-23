const { Schema, model } = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new Schema(
  {
    workspaceId: { type: String, required: true },
    tankId: { type: Schema.Types.ObjectId, ref: "Tank", required: true },
    itemType: { type: String, required: true },
    supplierName: { type: String, required: true },
    invoiceNumber: String,
    vehicleNumber: String,
    quantityLitres: { type: Number, required: true },
    ratePerLitre: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: "UserAccount", required: true },
    status: { type: String, enum: ["active", "voided"], default: "active" },
    voidedAt: Date,
    voidedBy: { type: Schema.Types.ObjectId, ref: "UserAccount" },
    voidedReason: String,
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, receivedAt: -1, _id: -1 });
schema.index({ workspaceId: 1, tankId: 1, status: 1 });
schema.plugin(requireWorkspaceScope);
module.exports = model("Delivery", schema);
