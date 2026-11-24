const crypto = require("node:crypto");
const env = require("../config/env");
const logger = require("../utils/logger");
const identity = require("../repositories/identity");
const {
  SubscriptionPlan,
  WorkspaceSubscription,
  LinkedRevenueAccount,
} = require("../models/subscription.model");
const WebhookEvent = require("../models/webhookEvent.model");
const provider = require("../services/razorpay.service");
const { atomic, fail } = require("../services/atomic.service");
const { lockWorkspace } = require("../services/workspaceWrite.service");
const { getEntitlements } = require("../services/entitlements.service");
const { plans } = require("../config/plans");

async function providerCall(work) {
  try {
    return await work();
  } catch (err) {
    if (err.status === 409) throw err;
    fail(502, "Razorpay could not complete the billing request. Try again later.");
  }
}

async function getPlan(body) {
  if (typeof body?.planId === "string" && /^[a-f0-9]{24}$/i.test(body.planId)) {
    return SubscriptionPlan.findById(body.planId);
  }
  if (typeof body?.planName !== "string" || !["monthly", "yearly"].includes(body?.billingCycle))
    fail(400, "Choose a plan and billing cycle");
  return SubscriptionPlan.findOne({ name: body.planName, billingCycle: body.billingCycle });
}

async function currentLink(workspace) {
  const { workspaceId, currentSubscriptionId } = workspace;
  return WorkspaceSubscription.findOne(
    currentSubscriptionId
      ? { workspaceId, razorpaySubscriptionId: currentSubscriptionId }
      : { workspaceId, status: { $in: ["active", "halted"] } }
  ).sort({ createdAt: -1 });
}

function checkout(subscriptionId) {
  return { subscriptionId, keyId: env.razorpay.keyId };
}

async function status(req, res) {
  const workspace = await identity.getWorkspace(req.workspaceId);
  if (!workspace) fail(404, "Workspace not found");
  const details = await getEntitlements(req.workspaceId, { workspace });
  const link = await currentLink(workspace);
  const scheduled =
    link?.pendingPlanId &&
    (await SubscriptionPlan.findById(link.pendingPlanId).select("name billingCycle"));
  res.json({
    ...details,
    nextRenewal: details.currentPeriodEnd,
    canCancel: Boolean(link && ["active", "halted"].includes(link.status)),
    scheduledPlan: scheduled
      ? { name: scheduled.name, billingCycle: scheduled.billingCycle }
      : null,
  });
}

async function createSubscription(req, res) {
  const { workspaceId } = req;
  const plan = await getPlan(req.body);
  if (!plan) fail(404, "This plan and cycle are not configured");
  if (!env.razorpay.keyId || !env.razorpay.keySecret)
    fail(503, "Razorpay checkout is not configured");

  const attempt = crypto.randomUUID();
  const workspace = await identity.reserveCheckout(
    workspaceId,
    attempt,
    new Date(Date.now() - 120_000)
  );
  if (!workspace) fail(409, "A billing change is already in progress");
  async function prepareCheckout() {
    const active = await currentLink(workspace);
    if (active && ["active", "halted"].includes(active.status)) {
      if (active.status !== "active" || workspace.cancelAtCycleEnd)
        fail(409, "Resolve the current subscription before changing plans");
      if (String(active.planId) === String(plan._id) && !active.pendingPlanId)
        fail(409, "This is your current plan");
      await providerCall(async () => {
        try {
          await provider.changePlan(active.razorpaySubscriptionId, plan.razorpayPlanId);
        } catch (err) {
          if (/cannot be updated.*UPI/i.test(err.error?.description ?? "")) {
            fail(
              409,
              "Razorpay cannot change this UPI subscription. Cancel at cycle end and select the new plan once it ends."
            );
          }
          throw err;
        }
      });
      await WorkspaceSubscription.updateOne(
        { workspaceId, _id: active._id },
        { $set: { pendingPlanId: plan._id } }
      );
      return { body: { scheduled: true, message: "Plan change scheduled for the next cycle." } };
    }
    if (workspace.pendingSubscriptionId) {
      const pending = await WorkspaceSubscription.findOne({
        workspaceId,
        razorpaySubscriptionId: workspace.pendingSubscriptionId,
        status: "created",
      });
      if (pending && String(pending.planId) === String(plan._id)) {
        return { body: { checkout: checkout(pending.razorpaySubscriptionId) } };
      }
      if (pending) fail(409, "Cancel the pending checkout before choosing a different plan");
    }

    const remote = await providerCall(() =>
      provider.createSubscription({
        razorpayPlanId: plan.razorpayPlanId,
        totalCount: plan.billingCycle === "yearly" ? 5 : 12,
      })
    );
    const link = await WorkspaceSubscription.create({
      workspaceId,
      planId: plan._id,
      razorpaySubscriptionId: remote.id,
      status: "created",
    });
    const updated = await identity.patchWorkspace(
      workspaceId,
      { pendingSubscriptionId: remote.id },
      { when: { checkoutAttempt: attempt } }
    );
    if (!updated) {
      await providerCall(() => provider.cancelSubscription(remote.id, false));
      fail(409, "The checkout window ended. Try again.");
    }
    return {
      status: 201,
      body: {
        subscription: link,
        razorpaySubscription: { id: remote.id },
        checkout: checkout(remote.id),
      },
    };
  }
  let result;
  try {
    result = await prepareCheckout();
  } finally {
    await identity.releaseCheckout(workspaceId, attempt);
  }
  res.status(result.status ?? 200).json(result.body);
}

async function cancel(req, res) {
  const { workspaceId } = req;
  const attempt = crypto.randomUUID();
  const workspace = await identity.reserveCheckout(
    workspaceId,
    attempt,
    new Date(Date.now() - 120_000)
  );
  if (!workspace) fail(409, "A billing change is already in progress");
  try {
    const active = await currentLink(workspace);
    if (active && ["active", "halted"].includes(active.status)) {
      if (workspace.cancelAtCycleEnd)
        return res.json({
          ok: true,
          cancelAtCycleEnd: true,
          currentPeriodEnd: workspace.currentPeriodEnd,
        });
      const remote = await providerCall(() =>
        provider.cancelSubscription(active.razorpaySubscriptionId, true)
      );
      const currentPeriodEnd = periodEnd(remote) || workspace.currentPeriodEnd;
      await identity.patchWorkspace(
        workspaceId,
        { cancelAtCycleEnd: true, currentPeriodEnd: currentPeriodEnd || undefined },
        { when: { checkoutAttempt: attempt } }
      );
      return res.json({ ok: true, cancelAtCycleEnd: true, currentPeriodEnd });
    }
    if (!workspace.pendingSubscriptionId) fail(404, "No subscription to cancel");
    await providerCall(() => provider.cancelSubscription(workspace.pendingSubscriptionId, false));
    await WorkspaceSubscription.updateOne(
      { workspaceId, razorpaySubscriptionId: workspace.pendingSubscriptionId, status: "created" },
      { $set: { status: "cancelled" } }
    );
    await identity.patchWorkspace(
      workspaceId,
      { pendingSubscriptionId: null },
      {
        when: {
          checkoutAttempt: attempt,
          pendingSubscriptionId: workspace.pendingSubscriptionId,
        },
      }
    );
    res.json({ ok: true, cancelAtCycleEnd: false });
  } finally {
    await identity.releaseCheckout(workspaceId, attempt);
  }
}

const eventStates = new Map([
  ["subscription.activated", ["active", "active", 2]],
  ["subscription.charged", ["active", "active", 3]],
  ["subscription.pending", ["halted", "past_due", 4]],
  ["subscription.halted", ["halted", "past_due", 5]],
  ["subscription.cancelled", ["cancelled", "cancelled", 7]],
  ["subscription.completed", ["completed", "expired", 6]],
  ["subscription.updated", [null, null, 1]],
]);

function periodEnd(entity) {
  return Number.isSafeInteger(entity.current_end) && entity.current_end > 0
    ? new Date(entity.current_end * 1000)
    : null;
}

function signed(req) {
  const signature = req.get("x-razorpay-signature");
  if (
    !env.razorpay.webhookSecret ||
    !Buffer.isBuffer(req.rawBody) ||
    !/^[a-f0-9]{64}$/i.test(signature ?? "")
  )
    return false;
  const expected = crypto
    .createHmac("sha256", env.razorpay.webhookSecret)
    .update(req.rawBody)
    .digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

async function transferRevenue(workspaceId, payment) {
  if (!payment?.id || !Number.isSafeInteger(payment.amount) || payment.amount <= 0) return;
  const linkedAccount = await LinkedRevenueAccount.findOne({ referredWorkspaceIds: workspaceId });
  if (!linkedAccount) return;
  try {
    // A provider can emit multiple event IDs for the same payment.
    await WebhookEvent.create({ provider: "razorpay", eventId: "transfer:" + payment.id });
  } catch (err) {
    if (err.code === 11000) return;
    logger.error({ msg: "Revenue split reservation failed", paymentId: payment.id });
    return;
  }
  try {
    await provider.transferShare({
      paymentId: payment.id,
      linkedAccountId: linkedAccount.razorpayAccountId,
      amountInPaise: payment.amount,
      sharePercent: linkedAccount.sharePercent,
    });
  } catch {
    logger.error({
      msg: "Revenue split transfer failed; reconcile in Razorpay",
      paymentId: payment.id,
    });
  }
}

async function handleWebhook(req, res) {
  if (!signed(req)) fail(400, "Invalid webhook signature");
  const event = req.body;
  const spec = eventStates.get(event.event);
  if (!spec) return res.json({ ok: true, ignored: true });
  const subscription = event.payload?.subscription?.entity;
  const eventAt = event.created_at;
  if (typeof subscription?.id !== "string" || !Number.isSafeInteger(eventAt) || eventAt <= 0)
    fail(400, "Invalid subscription event");
  const providerId = subscription.id;
  const eventId =
    req.get("x-razorpay-event-id") || crypto.createHash("sha256").update(req.rawBody).digest("hex");
  const eventKey = { provider: "razorpay", eventId: "event:" + eventId };
  const known = await WorkspaceSubscription.findOne({
    razorpaySubscriptionId: providerId,
  }).setOptions({ skipWorkspaceGuard: true });
  if (!known) return res.json({ ok: true, ignored: true });
  const { workspaceId } = known;
  let outcome;
  // TEMP(pg-cutover): the subscription records are still MongoDB-backed, so the workspace row is
  // updated after that transaction commits. Fold both into one PostgreSQL transaction when the
  // billing models are ported.
  let workspaceChange = null;
  try {
    outcome = await atomic(workspaceId, async (context) => {
      const { session, compensate } = context;
      const workspace = await lockWorkspace(workspaceId, context);
      workspaceChange = null;
      if (
        await WebhookEvent.exists({
          provider: "razorpay",
          eventId: { $in: [eventId, eventKey.eventId] },
        }).session(session)
      )
        return "deduped";
      const marker = await new WebhookEvent(eventKey).save({ session });
      compensate(() => WebhookEvent.deleteOne({ _id: marker._id }));
      const find = { workspaceId, razorpaySubscriptionId: providerId };
      const link = await WorkspaceSubscription.findOne(find).session(session);
      const [linkStatus, workspaceStatus, rank] = spec;
      const sameSecondDominates = eventAt === link.lastEventAt && rank <= (link.lastEventRank ?? 0);
      if (eventAt < (link.lastEventAt ?? 0) || sameSecondDominates) return "ignored";

      const plan =
        typeof subscription.plan_id === "string"
          ? await SubscriptionPlan.findOne({ razorpayPlanId: subscription.plan_id }).session(
              session
            )
          : await SubscriptionPlan.findById(link.planId).session(session);
      const end = periodEnd(subscription);
      const linkSet = {
        lastEventAt: eventAt,
        lastEventRank: rank,
        ...(linkStatus && { status: linkStatus }),
        ...(end && { currentPeriodEnd: end }),
        ...(plan && { planId: plan._id }),
      };
      const previous = Object.fromEntries(
        [...Object.keys(linkSet), "pendingPlanId"].map((key) => [key, link[key]])
      );
      const finishedChange = plan && String(link.pendingPlanId) === String(plan._id);
      await WorkspaceSubscription.updateOne(
        find,
        { $set: linkSet, ...(finishedChange && { $unset: { pendingPlanId: 1 } }) },
        { session }
      );
      compensate(() =>
        WorkspaceSubscription.updateOne(find, {
          $set: Object.fromEntries(
            Object.entries(previous).filter(([, value]) => value !== undefined)
          ),
          $unset: Object.fromEntries(
            Object.entries(previous)
              .filter(([, value]) => value === undefined)
              .map(([key]) => [key, 1])
          ),
        })
      );

      const current = workspace.currentSubscriptionId === providerId;
      const pending = workspace.pendingSubscriptionId === providerId;
      if (
        !current &&
        !pending &&
        (workspace.currentSubscriptionId || workspace.pendingSubscriptionId)
      )
        return "ignored";
      const terminal = workspaceStatus === "cancelled" || workspaceStatus === "expired";
      const clearPending =
        pending && (terminal || workspaceStatus === "active" || workspaceStatus === "past_due");
      if (pending && !current && terminal) {
        workspaceChange = { pendingSubscriptionId: null };
        return "applied";
      }
      const set = { ...(end && { currentPeriodEnd: end }) };
      const unset = {};
      if (workspaceStatus) {
        set.subscriptionStatus = workspaceStatus;
        set.currentSubscriptionId = providerId;
        if (workspaceStatus === "past_due")
          set.pastDueSince = workspace.pastDueSince || new Date(eventAt * 1000);
        else unset.pastDueSince = 1;
        if (terminal || (pending && !current)) set.cancelAtCycleEnd = false;
      }
      if (plan && (current || workspaceStatus === "active" || workspaceStatus === "past_due")) {
        set.planName = plan.name;
        set.planLimits = plan.planLimits || plans.find((item) => item.name === plan.name)?.limits;
      }
      if (clearPending) unset.pendingSubscriptionId = 1;
      workspaceChange = {
        ...set,
        ...Object.fromEntries(Object.keys(unset).map((key) => [key, null])),
      };
      return "applied";
    });
  } catch (err) {
    if (err.code === 11000) return res.json({ ok: true, deduped: true });
    throw err;
  }

  if (outcome === "applied" && workspaceChange && Object.keys(workspaceChange).length)
    await identity.patchWorkspace(workspaceId, workspaceChange);

  // A late charge still needs its revenue share; ordering only protects the subscription state.
  if (outcome !== "deduped" && event.event === "subscription.charged") {
    await transferRevenue(workspaceId, event.payload.payment?.entity).catch(() =>
      logger.error({ msg: "Revenue split could not be checked", workspaceId })
    );
  }
  res.json({ ok: true, ...(outcome !== "applied" && { [outcome]: true }) });
}

module.exports = { status, createSubscription, cancel, handleWebhook };
