const operations = require("../repositories/operations");
const { query } = require("../config/postgres");

const db = { query };

async function list(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
  const { notifications, total } = await operations.listNotifications(
    req.workspaceId,
    { status },
    { page: pageNumber, limit: pageSize }
  );
  res.json({ notifications, total, page: Number(page), limit: Number(limit) });
}

// Re-queues a failed job by resetting it to pending — the drain tick
// picks it back up. Doesn't call Twilio directly, keeps the same queue path.
async function retry(req, res) {
  const notification = await operations.getNotification(db, req.workspaceId, req.params.id);
  if (!notification) return res.status(404).json({ error: "Notification not found" });
  if (notification.status !== "failed") {
    return res.status(400).json({ error: "Only failed notifications can be retried" });
  }

  const job = await operations.getMessageJob(db, req.workspaceId, notification.messageJobId);
  if (!job) return res.status(404).json({ error: "Underlying message job not found" });

  if (job.sensitive)
    return res.status(409).json({ error: "Send a new invite or recovery code instead" });

  await operations.updateMessageJob(db, req.workspaceId, job._id, {
    status: "pending",
    attempts: 0,
    lastError: null,
  });

  res.json({ ok: true, message: "Job re-queued for retry" });
}

module.exports = { list, retry };
