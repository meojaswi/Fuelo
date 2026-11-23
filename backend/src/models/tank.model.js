const { Schema, model } = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new Schema(
  {
    workspaceId: { type: String, required: true },
    name: { type: String, required: true },
    itemType: { type: String, required: true },
    capacityLitres: { type: Number, required: true },
    bookStock: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deactivatedAt: Date,
    deactivatedReason: String,
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, name: 1 }, { unique: true });
schema.index({ workspaceId: 1, itemType: 1, isActive: 1 });
schema.plugin(requireWorkspaceScope);
module.exports = model("Tank", schema);
