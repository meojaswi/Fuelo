const MessageJob = require("../models/messageJob.model");
const Notification = require("../models/notification.model");
const twilioService = require("./twilio.service");
const logger = require("../utils/logger");

/**
 * Enqueues a message job. Called from controllers after a transaction is
 * saved — decouples request latency from Twilio's response time and gives
 * retries + an audit trail for free.
 */
async function enqueue({ workspaceId, transactionId, channel, toPhone, body }) {
  return MessageJob.create({ workspaceId, transactionId, channel, toPhone, body });
}

/**
 * Drains pending jobs across ALL workspaces. Runs on a tick (see
 * scheduler.service.js). Intentionally cross-workspace — guarded via the
 * explicit skipWorkspaceGuard escape hatch, not a bypass of the guard.
 */
async function drainPending(batchSize = 20) {
  const jobs = await MessageJob.find({ status: "pending", attempts: { $lt: 3 } })
    .setOptions({ skipWorkspaceGuard: true })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  for (const job of jobs) {
    job.attempts += 1;
    const result = await twilioService.sendMessage({
      channel: job.channel,
      toPhone: job.toPhone,
      body: job.body,
    });

    if (result.ok) {
      job.status = "sent";
      job.providerMessageSid = result.sid;
      job.sentAt = new Date();
    } else {
      job.lastError = result.error;
      if (job.attempts >= job.maxAttempts) job.status = "failed";
    }
    await job.save();

    await Notification.create({
      workspaceId: job.workspaceId,
      transactionId: job.transactionId,
      messageJobId: job._id,
      channel: job.channel,
      status: job.status === "sent" ? "sent" : job.status === "failed" ? "failed" : "pending",
      retryCount: job.attempts,
      messageBody: job.body,
    });
  }

  if (jobs.length) {
    logger.info({ msg: "Drained message queue", processed: jobs.length });
  }
}

module.exports = { enqueue, drainPending };
