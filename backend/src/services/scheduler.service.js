const cron = require("node-cron");
const SchedulerLock = require("../models/schedulerLock.model");
const Dealer = require("../models/dealer.model");
const DailySummary = require("../models/dailySummary.model");
const messageQueue = require("./messageQueue.service");
const messageBuilder = require("./messageBuilder.service");
const dashboardService = require("./dashboard.service");
const logger = require("../utils/logger");

/**
 * Tries to acquire a one-per-day lock for a named job. Returns true if this
 * process won the lock and should run the job. Relies on the unique index
 * on {jobName, runDate} — a duplicate-key error means another replica
 * already grabbed it, so we skip. Prevents double-sending EOD summaries if
 * Railway ever runs more than one instance.
 */
async function acquireDailyLock(jobName) {
  const runDate = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  try {
    await SchedulerLock.create({ jobName, runDate });
    return true;
  } catch (err) {
    if (err.code === 11000) return false; // already acquired elsewhere
    throw err;
  }
}

function startScheduler() {
  // Drain the message queue every 30 seconds — cheap, no external broker.
  cron.schedule("*/30 * * * * *", async () => {
    try {
      await messageQueue.drainPending();
    } catch (err) {
      logger.error({ msg: "Queue drain tick failed", err: err.message });
    }
  });

  // End-of-day summary, 11:00 PM IST (17:30 UTC).
  cron.schedule("30 17 * * *", async () => {
    const gotLock = await acquireDailyLock("eod-summary");
    if (!gotLock) {
      logger.info({ msg: "EOD summary skipped — lock held by another instance" });
      return;
    }
    logger.info({ msg: "Running EOD summary job" });
    await runEndOfDaySummary();
  });

  logger.info({ msg: "Scheduler started" });
}

/**
 * For each active dealer: aggregate today's transactions, persist a
 * DailySummary snapshot, and enqueue a WhatsApp summary message. Failures
 * on one workspace don't block the others — each dealer is isolated in
 * its own try/catch so one bad record can't take down the whole nightly run.
 */
async function runEndOfDaySummary() {
  const date = new Date().toISOString().slice(0, 10);
  const dealers = await Dealer.find({ isActive: true }).setOptions({ skipWorkspaceGuard: true });

  for (const dealer of dealers) {
    try {
      const items = await dashboardService.getDailySummary(dealer.workspaceId);
      if (!items.length) continue; // nothing happened today, skip silently

      const grandTotalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0);

      await DailySummary.findOneAndUpdate(
        { workspaceId: dealer.workspaceId, date },
        {
          workspaceId: dealer.workspaceId,
          date,
          items: items.map((i) => ({
            itemType: i._id,
            dispensed: i.totalQuantity,
            totalAmount: i.totalAmount,
          })),
          grandTotalAmount,
        },
        { upsert: true }
      );

      await messageQueue.enqueue({
        workspaceId: dealer.workspaceId,
        channel: "whatsapp",
        toPhone: dealer.phone,
        body: messageBuilder.buildEndOfDaySummary({
          workspaceName: dealer.businessName,
          date,
          lines: items.map((i) => ({ itemType: i._id, quantity: i.totalQuantity, unit: "" })),
          totalAmount: grandTotalAmount,
        }),
      });
    } catch (err) {
      logger.error({
        msg: "EOD summary failed for workspace",
        workspaceId: dealer.workspaceId,
        err: err.message,
      });
    }
  }
}

module.exports = { startScheduler, acquireDailyLock };
