const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const customerSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    isCreditCustomer: { type: Boolean, default: false },
    creditBalance: { type: Number, default: 0 },
    gstin: String,
    billingAddress: String,
    state: String,
    vehicles: [{ _id: false, number: { type: String, required: true }, label: String }],
    creditDays: { type: Number, default: null },
    lastReminderAt: Date,
    creditLimit: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ workspaceId: 1, creditBalance: -1, _id: 1 });
customerSchema.index({ workspaceId: 1, phone: 1 }, { unique: true });
customerSchema.index({ workspaceId: 1, name: "text" }); // autocomplete

customerSchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("Customer", customerSchema);
