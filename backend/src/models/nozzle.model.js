const { Schema, model } = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new Schema(
  {
    workspaceId: { type: String, required: true },
    tankId: { type: Schema.Types.ObjectId, ref: "Tank", required: true },
    label: { type: String, required: true },
    itemType: { type: String, required: true },
    lastMeterReading: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    deactivatedAt: Date,
    deactivatedReason: String,
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, label: 1 }, { unique: true });
schema.index({ workspaceId: 1, tankId: 1, isActive: 1 });
schema.plugin(requireWorkspaceScope);
module.exports = model("Nozzle", schema);
