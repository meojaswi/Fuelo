const Razorpay = require("razorpay");
const env = require("../config/env");

const razorpay = new Razorpay({
  key_id: env.razorpay.keyId,
  key_secret: env.razorpay.keySecret,
});

async function createSubscription({ razorpayPlanId, totalCount = 12, customerNotify = 1 }) {
  return razorpay.subscriptions.create({
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

  return razorpay.payments.transfer(paymentId, {
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

module.exports = { razorpay, createSubscription, transferShare };
