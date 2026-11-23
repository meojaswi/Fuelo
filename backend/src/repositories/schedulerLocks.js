const { query } = require("../config/postgres");
const { istDateString } = require("../utils/datetime");

async function acquireDailyLock(jobName, runDate = istDateString()) {
  const { rowCount } = await query(
    `INSERT INTO scheduler_locks (job_name, run_date)
     VALUES ($1, $2)
     ON CONFLICT (job_name, run_date) DO NOTHING`,
    [jobName, runDate]
  );
  return rowCount === 1;
}

module.exports = { acquireDailyLock };
