const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema({
  workspaceId: { type: String, required: true },
  year: { type: String, required: true },
  kind: { type: String, enum: ["invoice", "credit_note"], required: true },
  sequence: { type: Number, required: true },
});
schema.index({ workspaceId: 1, year: 1, kind: 1 }, { unique: true });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("InvoiceCounter", schema);
