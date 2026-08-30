const dashboardService = require("../services/dashboard.service");

async function getToday(req, res) {
  const summary = await dashboardService.getDailySummary(req.workspaceId);
  res.json({ date: new Date().toISOString().slice(0, 10), items: summary });
}

module.exports = { getToday };
