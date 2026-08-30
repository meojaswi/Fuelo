const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const customerSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    isCreditCustomer: { type: Boolean, default: false },
    creditBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ workspaceId: 1, phone: 1 }, { unique: true });
customerSchema.index({ workspaceId: 1, name: "text" }); // autocomplete

customerSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Customer", customerSchema);
