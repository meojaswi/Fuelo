const { Types } = require("mongoose");
const Transaction = require("../models/transaction.model");
const { istDayBoundsUTC } = require("../utils/datetime");

/**
 * Today's per-itemType totals for a workspace (Diesel/Petrol/CNG for a fuel
 * vertical, or whatever labels that workspace's config defines).
 */
async function getDailySummary(workspaceId, date = new Date(), userId) {
  const { startUTC, endUTC } = istDayBoundsUTC(date);

  const rows = await Transaction.aggregate([
    {
      $match: {
        workspaceId,
        ...(userId ? { createdBy: new Types.ObjectId(userId) } : {}),
        status: "active",
        createdAt: { $gte: startUTC, $lt: endUTC },
      },
    },
    {
      $group: {
        _id: "$itemType",
        unit: { $first: "$unit" },
        totalQuantity: { $sum: { $toDecimal: "$quantity" } },
        totalAmount: { $sum: { $toDecimal: "$amount" } },
        count: { $sum: 1 },
      },
    },
    {
      $set: {
        totalQuantity: { $toDouble: "$totalQuantity" },
        totalAmount: { $toDouble: { $round: ["$totalAmount", 2] } },
      },
    },
  ]);

  return rows;
}

module.exports = { getDailySummary };
