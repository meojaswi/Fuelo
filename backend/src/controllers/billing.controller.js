const crypto = require("crypto");
const env = require("../config/env");
const logger = require("../utils/logger");

const { SubscriptionPlan, WorkspaceSubscription, LinkedRevenueAccount } = require("../models/subscription.model");
const WebhookEvent = require("../models/webhookEvent.model");
const razorpayService = require("../services/razorpay.service");

async function createSubscription(req, res) {
  const { planId } = req.body;

  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) return res.status(404).json({ error: "Plan not found" });

  const rzpSub = await razorpayService.createSubscription({ razorpayPlanId: plan.razorpayPlanId });

  const workspaceSub = await WorkspaceSubscription.create({
    workspaceId: req.workspaceId,
    planId: plan._id,
    razorpaySubscriptionId: rzpSub.id,
    status: "created",
  });

  res.status(201).json({ subscription: workspaceSub, razorpaySubscription: rzpSub });
}

/**
 * Razorpay webhook. Verifies signature, dedupes by event ID (idempotency),
 * then on a successful charge: updates subscription status and, if this
 * workspace was referred, auto-transfers the referral partner's share via
 * Razorpay Route.
 */
async function handleWebhook(req, res) {
  const signature = req.headers["x-razorpay-signature"];
  const expected = crypto
    .createHmac("sha256", env.razorpay.webhookSecret)
    .update(req.rawBody) // requires raw body — see index.js body-parser note
    .digest("hex");

  if (signature !== expected) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = req.body;
  const eventId = req.headers["x-razorpay-event-id"] || event.event + ":" + (event.payload?.payment?.entity?.id || "");

  try {
    await WebhookEvent.create({ provider: "razorpay", eventId });
  } catch (err) {
    if (err.code === 11000) {
      // Already processed this event — ack without redoing work.
      return res.status(200).json({ ok: true, deduped: true });
    }
    throw err;
  }

  if (event.event === "subscription.charged") {
    const rzpSubId = event.payload.subscription.entity.id;
    const payment = event.payload.payment.entity;

    const workspaceSub = await WorkspaceSubscription.findOne({
      razorpaySubscriptionId: rzpSubId,
    }).setOptions({ skipWorkspaceGuard: true });

    if (workspaceSub) {
      workspaceSub.status = "active";
      await workspaceSub.save();

      const linkedAccount = await LinkedRevenueAccount.findOne({
        referredWorkspaceIds: workspaceSub.workspaceId,
      });

      if (linkedAccount) {
        try {
          await razorpayService.transferShare({
            paymentId: payment.id,
            linkedAccountId: linkedAccount.razorpayAccountId,
            amountInPaise: payment.amount,
            sharePercent: linkedAccount.sharePercent,
          });
        } catch (err) {
          logger.error({ msg: "Revenue split transfer failed", err: err.message, paymentId: payment.id });
          // Don't fail the webhook ack over this — log and handle
          // reconciliation separately rather than causing Razorpay to retry
          // the whole event (which would re-trigger the subscription update).
        }
      }
    }
  }

  res.status(200).json({ ok: true });
}

module.exports = { createSubscription, handleWebhook };
