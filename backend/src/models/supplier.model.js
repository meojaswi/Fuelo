const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    name: { type: String, required: true },
    phone: String,
    gstin: String,
    address: String,
    state: String,
    openingBalance: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deactivationReason: String,
  },
  { timestamps: true }
);

schema.index({ workspaceId: 1, isActive: 1, name: 1 });
schema.index({ workspaceId: 1, balance: -1 });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("Supplier", schema);
