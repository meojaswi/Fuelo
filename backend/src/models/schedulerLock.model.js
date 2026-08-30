const mongoose = require("mongoose");

// A cheap distributed lock so the EOD-summary cron can't double-fire if
// Railway ever runs more than one instance. A job acquires the lock by
// inserting a doc for {jobName, runDate} — the unique index makes a second
// concurrent insert fail, which is the signal to skip.
const schedulerLockSchema = new mongoose.Schema(
  {
    jobName: { type: String, required: true },
    runDate: { type: String, required: true }, // "YYYY-MM-DD" in IST
    acquiredAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

schedulerLockSchema.index({ jobName: 1, runDate: 1 }, { unique: true });

module.exports = mongoose.model("SchedulerLock", schedulerLockSchema);
