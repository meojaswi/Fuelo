const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

// Persisted snapshot, distinct from the live aggregation in
// dashboard.service.js — this is the record written once the EOD job runs,
// so historical days don't need to be re-aggregated from raw transactions.
const dailySummarySchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" in IST

    items: [
      {
        itemType: String,
        openingStock: Number,
        dispensed: Number,
        closingStock: Number,
        totalAmount: Number,
      },
    ],

    grandTotalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dailySummarySchema.index({ workspaceId: 1, date: 1 }, { unique: true });
dailySummarySchema.plugin(requireWorkspaceScope);

module.exports = mongoose.model("DailySummary", dailySummarySchema);
