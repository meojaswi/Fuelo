const mongoose = require("mongoose");
const { plans } = require("../src/config/plans");
const { SubscriptionPlan } = require("../src/models/subscription.model");

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
      await SubscriptionPlan.updateOne(
        { name, billingCycle },
        {
          $set: {
            priceInPaise: price * 100,
            transactionCap: limits.monthlyTransactionCap,
            planLimits: limits,
            razorpayPlanId,
          },
        },
        { upsert: true, runValidators: true }
      );
      seeded++;
    }
  }
  return { seeded, skipped };
}

async function main() {
  const path = require("node:path");
  require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    await SubscriptionPlan.init();
    console.log(JSON.stringify(await seed()));
  } finally {
    await mongoose.disconnect();
  }
}
if (require.main === module)
  main().catch(() => {
    console.error("Plan seed failed. Check database connectivity and plan indexes.");
    process.exitCode = 1;
  });
module.exports = { seed };
