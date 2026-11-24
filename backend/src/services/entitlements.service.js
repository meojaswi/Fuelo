const identity = require("../repositories/identity");
const Transaction = require("../models/transaction.model");
const { trialLimits } = require("../config/plans");
const { istDateString, istDayBoundsUTC } = require("../utils/datetime");
const { fail } = require("./atomic.service");

const DAY = 86400000;
class EntitlementError extends Error {
  constructor(code, message) {
    super(message);
    this.status = 402;
    this.publicCode = code;
    this.upgradeRequired = true;
  }
}

function state(workspace, now = new Date()) {
  const status = workspace.subscriptionStatus || "trialing";
  const trialDaysLeft = Math.max(0, Math.ceil((+workspace.trialEndsAt - +now) / DAY) || 0);
  const graceEndsAt =
    status === "past_due" && workspace.pastDueSince
      ? new Date(+workspace.pastDueSince + 3 * DAY)
      : null;
  const expiredTrial = status === "trialing" && trialDaysLeft === 0;
  const readOnly =
    expiredTrial ||
    status === "cancelled" ||
    status === "expired" ||
    (status === "past_due" && (!graceEndsAt || now >= graceEndsAt)) ||
    (status === "active" &&
      workspace.cancelAtCycleEnd &&
      workspace.currentPeriodEnd &&
      now >= workspace.currentPeriodEnd);
  return {
    planName: workspace.planName || "Trial",
    status: expiredTrial ? "expired" : status,
    readOnly: Boolean(readOnly),
    trialDaysLeft,
    trialEndsAt: workspace.trialEndsAt,
    graceEndsAt,
    currentPeriodEnd: workspace.currentPeriodEnd,
    cancelAtCycleEnd: workspace.cancelAtCycleEnd,
    checkoutPending: Boolean(workspace.pendingSubscriptionId),
    code: expiredTrial ? "TRIAL_EXPIRED" : readOnly ? "SUBSCRIPTION_INACTIVE" : undefined,
  };
}

function caps(workspace) {
  return workspace.planLimits ?? trialLimits;
}

function monthBounds(now) {
  const [year, month] = istDateString(now).split("-");
  const next = new Date(Date.UTC(Number(year), Number(month), 1, 12));
  return {
    $gte: istDayBoundsUTC(`${year}-${month}-01`).startUTC,
    $lt: istDayBoundsUTC(istDateString(next)).startUTC,
  };
}

function transactionCount(workspaceId, now, session) {
  return Transaction.countDocuments({
    workspaceId,
    status: { $ne: "voided" },
    createdAt: monthBounds(now),
  }).session(session);
}

function memberCount(workspaceId, now, db) {
  return identity.countSeats(workspaceId, now, db);
}

async function workspaceFor(workspaceId, { workspace, db }) {
  const result = workspace ?? (await identity.getWorkspace(workspaceId, db));
  if (!result) fail(404, "Workspace not found");
  return result;
}

async function getEntitlements(workspaceId, options = {}) {
  const now = options.now ?? new Date();
  const workspace = await workspaceFor(workspaceId, options);
  const limits = caps(workspace);
  const transactions = await transactionCount(workspaceId, now, options.session);
  const members = await memberCount(workspaceId, now, options.db);
  return {
    ...state(workspace, now),
    limits,
    usage: { transactions, members },
    nearTransactionCap:
      limits.monthlyTransactionCap != null &&
      transactions >= Math.ceil(limits.monthlyTransactionCap * 0.8),
  };
}

async function assertCan(workspaceId, action, options = {}) {
  const now = options.now ?? new Date();
  const workspace = await workspaceFor(workspaceId, options);
  const { readOnly, code } = state(workspace, now);
  const limits = caps(workspace);
  if (action.startsWith("feature:")) {
    const feature = action.slice(8);
    // Preserve existing data and owner export access when a workspace is locked.
    if (readOnly || limits.features?.[feature]) return;
    throw new EntitlementError(
      "FEATURE_NOT_IN_PLAN",
      "This feature is unavailable on the current plan."
    );
  }
  if (readOnly)
    throw new EntitlementError(
      code,
      code === "TRIAL_EXPIRED"
        ? "Your trial has ended. Upgrade to resume editing."
        : "Your workspace is read-only. Update billing to resume editing."
    );
  if (action === "transaction:create" && limits.monthlyTransactionCap != null) {
    const count = await transactionCount(workspaceId, now, options.session);
    if (count >= limits.monthlyTransactionCap)
      throw new EntitlementError("PLAN_LIMIT_TRANSACTIONS", "Monthly transaction limit reached.");
    return { nearTransactionCap: count + 1 >= Math.ceil(limits.monthlyTransactionCap * 0.8) };
  }
  if (
    action === "member:activate" &&
    limits.maxUsers != null &&
    (await identity.countActiveMembers(workspaceId, options.db)) >= limits.maxUsers
  ) {
    throw new EntitlementError("PLAN_LIMIT_USERS", "The workspace has reached its member limit.");
  }
  if (
    action === "member:add" &&
    limits.maxUsers != null &&
    !options.seatReserved &&
    (await memberCount(workspaceId, now, options.db)) >= limits.maxUsers
  ) {
    throw new EntitlementError("PLAN_LIMIT_USERS", "The workspace has reached its member limit.");
  }
}

module.exports = { EntitlementError, getEntitlements, assertCan, state, caps };
