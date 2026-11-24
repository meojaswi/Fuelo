const { Schema, model } = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new Schema(
  {
    workspaceId: { type: String, required: true },
    // TEMP(pg-cutover): remove when shift is ported
    openedBy: { type: String, ref: "UserAccount", required: true },
    openedAt: { type: Date, required: true, default: Date.now },
    closedAt: Date,
    status: { type: String, enum: ["open", "closed"], default: "open" },
    pricesSnapshot: [{ _id: false, itemType: String, pricePerUnit: Number }],
    nozzleReadings: [
      {
        _id: false,
        nozzleId: { type: Schema.Types.ObjectId, ref: "Nozzle" },
        tankId: { type: Schema.Types.ObjectId, ref: "Tank" },
        label: String,
        itemType: String,
        previousMeter: Number,
        openingMeter: Number,
        closingMeter: Number,
        litresSold: Number,
        testLitres: Number,
      },
    ],
    declaredCash: Number,
    declaredUpi: Number,
    declaredCard: Number,
    creditSalesTotal: Number,
    expectedSalesTotal: Number,
    variance: Number,
    stockEffects: [
      {
        _id: false,
        itemType: String,
        delta: Number,
        movementId: Schema.Types.ObjectId,
        tankChanges: [{ _id: false, tankId: Schema.Types.ObjectId, delta: Number }],
      },
    ],
    reopenedAt: Date,
  },
  { timestamps: true }
);
schema.index(
  { workspaceId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "open" } }
);
schema.index({ workspaceId: 1, status: 1, closedAt: -1 });
schema.index({ workspaceId: 1, openedAt: -1, _id: -1 });
schema.plugin(requireWorkspaceScope);
module.exports = model("Shift", schema);
