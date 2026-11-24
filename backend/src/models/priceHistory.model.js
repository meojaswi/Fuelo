const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema({
  workspaceId: { type: String, required: true },
  itemType: { type: String, required: true },
  oldPrice: { type: Number, required: true },
  newPrice: { type: Number, required: true },
  // TEMP(pg-cutover): remove when priceHistory is ported
  changedBy: { type: String, ref: "UserAccount", required: true },
  changedAt: { type: Date, required: true },
});

schema.index({ workspaceId: 1, itemType: 1, changedAt: -1 });
schema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("PriceHistory", schema);
