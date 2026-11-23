const { roundMoney } = require("../utils/money");
const DailySummary = require("../models/dailySummary.model");
const { istDayBoundsUTC } = require("../utils/datetime");
const dashboardService = require("../services/dashboard.service");

async function getByDate(req, res) {
  const { date } = req.query; // "YYYY-MM-DD"
  if (typeof date !== "string") return res.status(400).json({ error: "date is required" });
  try {
    istDayBoundsUTC(date);
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    return res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
  }

  // Keep the snapshot response shape but calculate current totals after voids
  // and sales posted in the last five minutes of a business day.
  const saved = await DailySummary.findOne({ workspaceId: req.workspaceId, date });

  const live = await dashboardService.getDailySummary(req.workspaceId, date);
  if (saved) {
    const prevItems = new Map(saved.items.map((item) => [item.itemType, item.toObject()]));
    const items = live.map((row) => ({
      ...prevItems.get(row._id),
      itemType: row._id,
      dispensed: row.totalQuantity,
      totalAmount: row.totalAmount,
    }));
    return res.json({
      ...saved.toObject(),
      items,
      grandTotalAmount: roundMoney(items.reduce((total, item) => total + item.totalAmount, 0)),
    });
  }
  res.json({ workspaceId: req.workspaceId, date, items: live, live: true });
}

module.exports = { getByDate };
