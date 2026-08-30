const Notification = require("../models/notification.model");
const MessageJob = require("../models/messageJob.model");

async function list(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = { workspaceId: req.workspaceId };
  if (status) filter.status = status;

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Notification.countDocuments(filter);
  res.json({ notifications, total, page: Number(page), limit: Number(limit) });
}

// Re-queues a failed job by resetting it to pending — the drain tick
// picks it back up. Doesn't call Twilio directly, keeps the same queue path.
async function retry(req, res) {
  const notification = await Notification.findOne({
    _id: req.params.id,
    workspaceId: req.workspaceId,
  });
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  if (notification.status !== "failed") {
    return res.status(400).json({ error: "Only failed notifications can be retried" });
  }

  const job = await MessageJob.findOne({
    _id: notification.messageJobId,
    workspaceId: req.workspaceId,
  });
  if (!job) return res.status(404).json({ error: "Underlying message job not found" });

  job.status = "pending";
  job.attempts = 0;
  job.lastError = undefined;
  await job.save();

  res.json({ ok: true, message: "Job re-queued for retry" });
}

module.exports = { list, retry };
