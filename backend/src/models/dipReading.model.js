const { Schema, model } = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new Schema(
  {
    workspaceId: { type: String, required: true },
    tankId: { type: Schema.Types.ObjectId, ref: "Tank", required: true },
    readingLitres: { type: Number, required: true },
    bookStock: { type: Number, required: true },
    varianceLitres: { type: Number, required: true },
    recordedAt: { type: Date, default: Date.now },
    // TEMP(pg-cutover): remove when dipReading is ported
    recordedBy: { type: String, ref: "UserAccount", required: true },
    note: String,
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, tankId: 1, recordedAt: -1, _id: -1 });
schema.index({ workspaceId: 1, recordedAt: -1 });
schema.plugin(requireWorkspaceScope);
module.exports = model("DipReading", schema);
