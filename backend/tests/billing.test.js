const assert = require("node:assert/strict");
const { test } = require("node:test");
const { request, phaseWorkspace, sale, UserAccount } = require("./helpers/api");

test("trial usage, concurrent cap, seat limits and expired read-only access", async () => {
  const owner = await phaseWorkspace("9000000040");
  const {
    token,
    dealer: { workspaceId },
  } = owner;
  assert.equal(owner.dealer.billing.trialDaysLeft, 14);
  const Workspace = require("../src/models/workspace.model");
  const Membership = require("../src/models/membership.model");
  const Transaction = require("../src/models/transaction.model");
  const { istDateString } = require("../src/utils/datetime");
  const initial = await request("/api/billing/status", { token });
  assert.equal(initial.data.limits.monthlyTransactionCap, 100);
  assert.equal(initial.data.usage.members, 1);
  await Transaction.insertMany(
    Array.from({ length: 99 }, () => ({ ...sale, workspaceId, paymentMode: "cash" }))
  );
  const sell = () =>
    request("/api/transactions", { token, method: "POST", body: { ...sale, paymentMode: "cash" } });
  const posts = await Promise.all([sell(), sell()]);
  assert.deepEqual(posts.map((item) => item.status).sort(), [201, 402]);
  const posted = posts.find((item) => item.status === 201);
  assert.equal(posted.headers.get("x-fuelo-usage-warning"), "MONTHLY_TRANSACTIONS_80");
  assert.equal(posts.find((item) => item.status === 402).data.code, "PLAN_LIMIT_TRANSACTIONS");
  assert.equal(
    (
      await request("/api/transactions/" + posted.data._id + "/void", {
        token,
        method: "POST",
        body: { reason: "free slot" },
      })
    ).status,
    200
  );
  assert.equal((await sell()).status, 201);

  const invite = (phone) =>
    request("/api/members/invite", {
      method: "POST",
      token,
      body: { phone, name: "Staff", role: "attendant" },
    });
  assert.equal((await invite("9000000041")).status, 201);
  assert.equal((await invite("9000000042")).status, 201);
  assert.equal((await invite("9000000043")).data.code, "PLAN_LIMIT_USERS");
  assert.equal(await UserAccount.exists({ phone: "9000000043" }), null);

  const manager = await UserAccount.create({ phone: "9000000044", name: "Manager" });
  await Membership.create({ workspaceId, userId: manager._id, role: "manager" });
  const managerSession = await require("../src/controllers/auth.controller").sessionFor(
    manager,
    workspaceId
  );
  for (const [path, method] of [
    ["status", "GET"],
    ["subscriptions", "POST"],
    ["cancel", "POST"],
  ]) {
    assert.equal(
      (await request("/api/billing/" + path, { token: managerSession.token, method })).status,
      403
    );
  }

  await Workspace.updateOne({ workspaceId }, { $set: { trialEndsAt: new Date(0) } });
  const expired = await sell();
  assert.equal(expired.status, 402);
  assert.deepEqual(
    { code: expired.data.code, upgradeRequired: expired.data.upgradeRequired },
    { code: "TRIAL_EXPIRED", upgradeRequired: true }
  );
  assert.equal((await invite("9000000045")).data.code, "TRIAL_EXPIRED");
  assert.equal((await request("/api/inventory", { token })).status, 200);
  assert.equal((await request("/api/customers/outstanding", { token })).status, 200);
  const day = istDateString();
  assert.equal(
    (await request(`/api/reports/sales?from=${day}&to=${day}&format=csv`, { token })).status,
    200
  );
});

test("signed subscription events are idempotent and ordered; grace and cancellation preserve access correctly", async (t) => {
  const crypto = require("node:crypto");
  const owner = await phaseWorkspace("9000000046");
  const {
    token,
    dealer: { workspaceId },
  } = owner;
  const { seed } = require("../scripts/seedPlans");
  const { SubscriptionPlan, LinkedRevenueAccount } = require("../src/models/subscription.model");
  const provider = require("../src/services/razorpay.service");
  const seeded = {
    RAZORPAY_PLAN_GROWTH_MONTHLY: "plan_fuelo_growth",
    RAZORPAY_PLAN_BUSINESS_YEARLY: "plan_fuelo_business",
  };
  assert.deepEqual(await seed(seeded, () => {}), { seeded: 2, skipped: 4 });
  await seed(seeded, () => {});
  assert.equal(await SubscriptionPlan.countDocuments(), 2);
  const create = t.mock.method(provider, "createSubscription", async () => ({
    id: "sub_fuelo_ci",
  }));
  const cancel = t.mock.method(provider, "cancelSubscription", async () => ({
    current_end: Math.floor(Date.now() / 1000) + 3600,
  }));
  const change = t.mock.method(provider, "changePlan", async () => ({}));
  const share = t.mock.method(provider, "transferShare", async () => ({}));
  await LinkedRevenueAccount.create({
    ownerName: "Test partner",
    razorpayAccountId: "acc_test",
    sharePercent: 30,
    referredWorkspaceIds: [workspaceId],
  });
  const start = (planName = "Growth", billingCycle = "monthly") =>
    request("/api/billing/subscriptions", {
      token,
      method: "POST",
      body: { planName, billingCycle },
    });
  const checkout = await start();
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.checkout.subscriptionId, "sub_fuelo_ci");
  assert.equal((await start()).status, 200);
  assert.equal(create.mock.callCount(), 1);

  const now = Math.floor(Date.now() / 1000);
  const webhook = (event, created_at, eventId, plan_id = "plan_fuelo_growth") => {
    const body = {
      event,
      created_at,
      payload: {
        subscription: { entity: { id: "sub_fuelo_ci", plan_id, current_end: now + 3600 } },
        payment: { entity: { id: "pay_fuelo_ci", amount: 99900 } },
      },
    };
    return request("/api/billing/webhook", {
      method: "POST",
      body,
      headers: {
        "x-razorpay-event-id": eventId,
        "x-razorpay-signature": crypto
          .createHmac("sha256", "test-only-webhook")
          .update(JSON.stringify(body))
          .digest("hex"),
      },
    });
  };
  assert.equal((await request("/api/billing/webhook", { method: "POST", body: {} })).status, 400);
  assert.equal((await webhook("subscription.charged", now, "charge")).status, 200);
  assert.equal((await webhook("subscription.charged", now, "charge")).data.deduped, true);
  assert.equal((await webhook("subscription.pending", now - 10, "older")).data.ignored, true);
  assert.equal(share.mock.callCount(), 1);
  const status = () => request("/api/billing/status", { token });
  assert.equal((await status()).data.planName, "Growth");

  assert.equal((await start("Business", "yearly")).data.scheduled, true);
  assert.equal(change.mock.callCount(), 1);
  assert.equal((await status()).data.scheduledPlan.name, "Business");
  await webhook("subscription.charged", now + 10, "charge2", "plan_fuelo_business");
  assert.equal((await status()).data.planName, "Business");
  assert.equal(share.mock.callCount(), 1);
  await webhook("subscription.halted", now + 20, "halt", "plan_fuelo_business");
  const due = await status();
  assert.equal(due.data.status, "past_due");
  assert.equal(due.data.readOnly, false);
  const { getEntitlements } = require("../src/services/entitlements.service");
  assert.equal(
    (await getEntitlements(workspaceId, { now: new Date((now + 21) * 1000 + 3 * 86400000) }))
      .readOnly,
    true
  );
  const cancelled = await request("/api/billing/cancel", { token, method: "POST" });
  assert.equal(cancelled.data.cancelAtCycleEnd, true);
  assert.equal(cancel.mock.calls[0].arguments[1], true);
  await webhook("subscription.cancelled", now + 30, "cancel", "plan_fuelo_business");
  assert.equal((await status()).data.readOnly, true);
});
