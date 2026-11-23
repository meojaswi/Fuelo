const dashboardService = require("../services/dashboard.service");
const { roundMoney } = require("../utils/money");
const Notification = require("../models/notification.model");
const { istDateString, istDayBoundsUTC } = require("../utils/datetime");

async function getToday(req, res) {
  const date = istDateString();
  const { startUTC, endUTC } = istDayBoundsUTC(date);
  const filter = { workspaceId: req.workspaceId, createdAt: { $gte: startUTC, $lt: endUTC } };
  const [rows, sent, failed] = await Promise.all([
    dashboardService.getDailySummary(req.workspaceId, date),
    Notification.countDocuments({ ...filter, status: "sent" }),
    Notification.countDocuments({ ...filter, status: "failed" }),
  ]);
  const items = rows.map((row) => ({
    ...row,
    name: row._id,
    quantity: row.totalQuantity,
  }));
  res.json({
    date,
    items,
    sales: roundMoney(rows.reduce((total, row) => total + row.totalAmount, 0)),
    sold: rows.reduce((total, row) => total + row.totalQuantity, 0),
    notifications: { sent, failed },
  });
}

module.exports = { getToday };
