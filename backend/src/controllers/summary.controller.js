const DailySummary = require("../models/dailySummary.model");
const dashboardService = require("../services/dashboard.service");

async function getByDate(req, res) {
  const { date } = req.query; // "YYYY-MM-DD"
  if (!date) return res.status(400).json({ error: "date query param required" });

  // Prefer the persisted snapshot (written by the EOD job); fall back to a
  // live aggregation for today or any date that hasn't been snapshotted yet.
  const saved = await DailySummary.findOne({ workspaceId: req.workspaceId, date });
  if (saved) return res.json(saved);

  const live = await dashboardService.getDailySummary(req.workspaceId, new Date(date));
  res.json({ workspaceId: req.workspaceId, date, items: live, live: true });
}

module.exports = { getByDate };
