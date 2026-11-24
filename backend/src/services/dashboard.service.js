const sales = require("../repositories/sales");
const { istDayBoundsUTC } = require("../utils/datetime");

/**
 * Today's per-itemType totals for a workspace (Diesel/Petrol/CNG for a fuel
 * vertical, or whatever labels that workspace's config defines).
 */
async function getDailySummary(workspaceId, date = new Date(), userId) {
  const { startUTC, endUTC } = istDayBoundsUTC(date);
  return sales.dailyItemTotals(workspaceId, startUTC, endUTC, userId);
}

module.exports = { getDailySummary };
