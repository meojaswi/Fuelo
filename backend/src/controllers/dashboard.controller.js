const dashboardService = require("../services/dashboard.service");
const { roundMoney } = require("../utils/money");
const operations = require("../repositories/operations");
const { istDateString, istDayBoundsUTC } = require("../utils/datetime");

async function getToday(req, res) {
  const date = istDateString();
  const { startUTC, endUTC } = istDayBoundsUTC(date);
  const window = { from: startUTC, to: endUTC };
  const own = req.user.role === "attendant" ? req.user.userId : null;
  const [rows, sent, failed] = await Promise.all([
    dashboardService.getDailySummary(req.workspaceId, date, own),
    own ? 0 : operations.countNotifications(req.workspaceId, "sent", window),
    own ? 0 : operations.countNotifications(req.workspaceId, "failed", window),
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
