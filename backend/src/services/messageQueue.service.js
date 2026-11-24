const operations = require("../repositories/operations");
const { withTransaction } = require("../config/postgres");
const twilioService = require("./twilio.service");
const logger = require("../utils/logger");

/**
 * Enqueues a message job inside the caller's transaction, so a failed sale never leaves a
 * message behind. The drain tick below sends it later.
 */
function enqueue(job, { db }) {
  const { workspaceId, ...fields } = job;
  return operations.enqueueMessage(db, workspaceId, fields);
}

/**
 * Drains pending jobs across ALL workspaces on a tick (see scheduler.service.js). Each job is
 * claimed with FOR UPDATE SKIP LOCKED, so concurrent workers never send the same message twice.
 */
async function drainPending(batchSize = 20) {
  let processed = 0;
  for (let index = 0; index < batchSize; index++) {
    const handled = await withTransaction(async (db) => {
      const job = await operations.claimPendingJob(db);
      if (!job) return false;
      const attempts = job.attempts + 1;
      const expired = job.deliveryExpiresAt && job.deliveryExpiresAt <= new Date();
      const result = expired
        ? { ok: false, error: "Delivery expired" }
        : await twilioService.sendMessage({
            channel: job.channel,
            toPhone: job.toPhone,
            body: job.body,
            sensitive: job.sensitive,
            contentSid: job.contentSid,
            contentVariables: job.contentVariables,
          });
      const changes = { attempts };
      if (result.ok) {
        changes.status = "sent";
        changes.providerMessageSid = result.sid;
        changes.sentAt = new Date();
      } else {
        changes.lastError = result.error;
        if (expired || attempts >= job.maxAttempts) changes.status = "failed";
      }
      const status = changes.status ?? job.status;
      if (job.sensitive && status !== "pending") {
        changes.body = "Private WhatsApp message";
        changes.contentVariables = null;
      }
      await operations.updateMessageJob(db, job.workspaceId, job._id, changes);
      await operations.insertNotification(db, job.workspaceId, {
        transactionId: job.transactionId,
        messageJobId: job._id,
        channel: job.channel,
        status: status === "sent" ? "sent" : status === "failed" ? "failed" : "pending",
        retryCount: attempts,
        messageBody: job.sensitive ? "Private WhatsApp message" : job.body,
      });
      return true;
    });
    if (!handled) break;
    processed++;
  }
  if (processed) logger.info({ msg: "Drained message queue", processed });
}

module.exports = { enqueue, drainPending };
