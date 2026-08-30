const Transaction = require("../models/transaction.model");
const { istDayBoundsUTC } = require("../utils/datetime");

/**
 * Today's per-itemType totals for a workspace (Diesel/Petrol/CNG for a fuel
 * vertical, or whatever labels that workspace's config defines).
 */
async function getDailySummary(workspaceId, date = new Date()) {
  const { startUTC, endUTC } = istDayBoundsUTC(date);

  const rows = await Transaction.aggregate([
    {
      $match: {
        workspaceId,
        status: "active",
        createdAt: { $gte: startUTC, $lt: endUTC },
      },
    },
    {
      $group: {
        _id: "$itemType",
        totalQuantity: { $sum: "$quantity" },
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  return rows;
}

module.exports = { getDailySummary };
