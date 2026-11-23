// Unit tests import app modules that load config/env.js, which throws without
// these vars. CI has no backend/.env, so set test-only placeholders first.
// They never connect to a database. See CHECKS.md.
process.env.NODE_ENV = "test";
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/fuelo-unit-tests";
process.env.JWT_SECRET ??= "fuelo-unit-test-secret-only";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { istDateString, istDayBoundsUTC } = require("../src/utils/datetime");
const { roundMoney, priceForQuantity } = require("../src/utils/money");
const { permissionsFor } = require("../src/config/permissions");
const { state, caps } = require("../src/services/entitlements.service");
const { plans } = require("../src/config/plans");

test("IST midnights bound the 00:30 and 23:50 edges", () => {
  const { startUTC, endUTC } = istDayBoundsUTC("2026-11-23");
  assert.equal(startUTC.toISOString(), "2026-11-22T18:30:00.000Z");
  assert.equal(endUTC.toISOString(), "2026-11-23T18:30:00.000Z");
  assert.equal(istDateString(new Date("2026-11-22T19:00:00Z")), "2026-11-23");
  assert.equal(istDateString(new Date("2026-11-23T18:20:00Z")), "2026-11-23");
  assert.equal(istDateString(endUTC), "2026-11-24");
  assert.throws(() => istDayBoundsUTC("2026-02-30"), RangeError);
});

test("money rounds half paise consistently", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(priceForQuantity(7, 0.075), 0.53);
});

test("role permissions grant only the intended capabilities", () => {
  const allows = (role, permission) => permissionsFor(role).includes(permission);
  assert.ok(allows("attendant", "transactions:create"));
  assert.ok(!allows("attendant", "transactions:void"));
  assert.ok(!allows("attendant", "credit:payment"));
  assert.ok(allows("manager", "transactions:void"));
  assert.ok(!allows("manager", "billing:manage"));
  assert.ok(allows("owner", "billing:manage"));
  assert.ok(!allows("owner", "unknown"));
  assert.deepEqual(permissionsFor("unknown"), []);
});

test("the pump gate requires both the fuel vertical and a compatible plan", () => {
  const { checkPump } = require("../src/middleware/pump.middleware");
  assert.doesNotThrow(() => checkPump({ verticalType: "fuel" }, "tanks"));
  assert.doesNotThrow(() =>
    checkPump({ verticalType: "fuel", planLimits: plans[1].limits }, "tanks")
  );
  assert.throws(() => checkPump({ verticalType: "fuel", planLimits: plans[0].limits }, "tanks"), {
    status: 402,
    publicCode: "FEATURE_NOT_IN_PLAN",
  });
  assert.throws(() => checkPump({ verticalType: "timber", planLimits: plans[2].limits }, "tanks"), {
    status: 404,
  });
});

test("FIFO applies money from a voided paid sale to the next charge", () => {
  const { oldestUnpaidSale } = require("../src/services/fleetCredit.service");
  const saleDate = new Date("2026-11-13T19:00:00Z");
  const nextDate = new Date("2026-11-17T19:00:00Z");
  const entries = [
    {
      type: "credit_sale",
      direction: "debit",
      amount: 100,
      transactionId: "old",
      createdAt: saleDate,
    },
    { type: "payment", direction: "credit", amount: 100 },
    {
      type: "credit_sale",
      direction: "debit",
      amount: 120,
      transactionId: "next",
      createdAt: nextDate,
    },
    { type: "void_reversal", direction: "credit", amount: 100, transactionId: "old" },
  ];
  assert.equal(oldestUnpaidSale(entries), nextDate);
  entries.push({ type: "payment", direction: "credit", amount: 20 });
  assert.equal(oldestUnpaidSale(entries), null);
});

test("trial, grace, and cancellation enforce exact cutoff instants", () => {
  const now = new Date("2026-11-23T00:00:00Z");
  assert.equal(state({ trialEndsAt: new Date(+now + 1000) }, now).trialDaysLeft, 1);
  assert.equal(state({ trialEndsAt: now }, now).code, "TRIAL_EXPIRED");
  const pastDue = { subscriptionStatus: "past_due", pastDueSince: now };
  assert.equal(state(pastDue, new Date(+now + 3 * 86400000 - 1)).readOnly, false);
  assert.equal(state(pastDue, new Date(+now + 3 * 86400000)).readOnly, true);
  assert.ok(
    state({ subscriptionStatus: "active", cancelAtCycleEnd: true, currentPeriodEnd: now }, now)
      .readOnly
  );
  assert.equal(caps({}).monthlyTransactionCap, 100);
  assert.deepEqual(
    plans.map((plan) => plan.limits.monthlyTransactionCap),
    [300, 1500, null]
  );
});
