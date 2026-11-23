const Razorpay = require("razorpay");
const env = require("../config/env");

let razorpay;

function getClient() {
  razorpay ??= new Razorpay({
    key_id: env.razorpay.keyId,
    key_secret: env.razorpay.keySecret,
  });
  return razorpay;
}

async function createSubscription({ razorpayPlanId, totalCount = 12, customerNotify = 1 }) {
  return getClient().subscriptions.create({
    plan_id: razorpayPlanId,
    total_count: totalCount, // billing cycles, e.g. 12 for a yearly commitment on monthly billing
    customer_notify: customerNotify,
  });
}

/**
 * Auto-transfers a referral partner's share via Razorpay Route. Called from
 * the webhook handler on a successful subscription charge, only for
 * workspaces with a LinkedRevenueAccount.
 */
async function transferShare({ paymentId, linkedAccountId, amountInPaise, sharePercent }) {
  const shareAmount = Math.round((amountInPaise * sharePercent) / 100);

  return getClient().payments.transfer(paymentId, {
    transfers: [
      {
        account: linkedAccountId,
        amount: shareAmount,
        currency: "INR",
        on_hold: 0,
      },
    ],
  });
}

async function cancelSubscription(subscriptionId, atCycleEnd = true) {
  return getClient().subscriptions.cancel(subscriptionId, atCycleEnd);
}

async function changePlan(subscriptionId, razorpayPlanId) {
  return getClient().subscriptions.update(subscriptionId, {
    plan_id: razorpayPlanId,
    schedule_change_at: "cycle_end",
  });
}

module.exports = { createSubscription, transferShare, cancelSubscription, changePlan };
