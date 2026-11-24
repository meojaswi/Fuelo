const { plans } = require("../src/config/plans");
const operations = require("../src/repositories/operations");
const { getPool } = require("../src/config/postgres");

async function seed(env = process.env, warn = console.warn) {
  let seeded = 0;
  let skipped = 0;
  for (const { name, limits, monthly, yearly } of plans) {
    for (const [billingCycle, price] of Object.entries({ monthly, yearly })) {
      const key = `RAZORPAY_PLAN_${name.toUpperCase()}_${billingCycle.toUpperCase()}`;
      const razorpayPlanId = env[key];
      if (!razorpayPlanId) {
        warn(`Skipping ${name} ${billingCycle}: ${key} is missing`);
        skipped++;
        continue;
      }
      await operations.upsertPlan({
        name,
        billingCycle,
        priceInPaise: price * 100,
        transactionCap: limits.monthlyTransactionCap,
        planLimits: limits,
        razorpayPlanId,
      });
      seeded++;
    }
  }
  return { seeded, skipped };
}

async function main() {
  const path = require("node:path");
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  try {
    console.log(JSON.stringify(await seed()));
  } finally {
    await getPool().end();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error("Plan seed failed. Check DATABASE_URL and that migrations have run.");
    process.exitCode = 1;
  });
module.exports = { seed };
