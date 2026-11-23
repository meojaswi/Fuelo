const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema({
  workspaceId: { type: String, required: true },
  itemType: { type: String, required: true },
  oldPrice: { type: Number, required: true },
  newPrice: { type: Number, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccount", required: true },
  changedAt: { type: Date, required: true },
});

schema.index({ workspaceId: 1, itemType: 1, changedAt: -1 });
schema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("PriceHistory", schema);
