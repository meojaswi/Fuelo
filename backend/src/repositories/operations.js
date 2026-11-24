const { query } = require("../config/postgres");
const { defineTable, isId } = require("./table");

const database = { query };

const jobs = defineTable("message_jobs", { jsonb: ["contentVariables"] });
const notifications = defineTable("notifications");
const summaries = defineTable("daily_summaries", { jsonb: ["items"] });
const plans = defineTable("subscription_plans", { jsonb: ["planLimits"] });
const subscriptions = defineTable("workspace_subscriptions");
const linkedAccounts = defineTable("linked_revenue_accounts", { jsonb: ["referredWorkspaceIds"] });

// ----------------------------------------------------------------- messages

const enqueueMessage = (db, workspaceId, data) => jobs.insert(db, workspaceId, data);
const getMessageJob = (db, workspaceId, id, options) => jobs.get(db, workspaceId, id, options);
const updateMessageJob = (db, workspaceId, id, changes) => jobs.update(db, workspaceId, id, changes);

// The caller owns the transaction and the lock until it records the outcome.
async function claimPendingJob(db) {
  const { rows } = await db.query(
    `SELECT * FROM message_jobs
      WHERE status = 'pending' AND attempts < max_attempts
      ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`
  );
  return jobs.toDocument(rows[0]);
}

const insertNotification = (db, workspaceId, data) => notifications.insert(db, workspaceId, data);
const getNotification = (db, workspaceId, id) => notifications.get(db, workspaceId, id);

async function listNotifications(workspaceId, { status }, { page, limit }, db = database) {
  const values = [workspaceId, status ?? null];
  const where = `workspace_id = $1 AND ($2::text IS NULL OR status = $2)`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [...values, limit, (page - 1) * limit]
    ),
    db.query(`SELECT count(*)::int AS total FROM notifications WHERE ${where}`, values),
  ]);
  return { notifications: rows.rows.map(notifications.toDocument), total: count.rows[0].total };
}

async function latestNotificationFor(workspaceId, transactionId, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM notifications WHERE workspace_id = $1 AND transaction_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [workspaceId, transactionId]
  );
  return notifications.toDocument(rows[0]);
}

async function countNotifications(workspaceId, status, { from, to }, db = database) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM notifications
      WHERE workspace_id = $1 AND status = $2 AND created_at >= $3 AND created_at < $4`,
    [workspaceId, status, from, to]
  );
  return rows[0].total;
}

// ---------------------------------------------------------- daily summaries

async function getSummary(workspaceId, date, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM daily_summaries WHERE workspace_id = $1 AND date = $2`,
    [workspaceId, date]
  );
  return summaries.toDocument(rows[0]);
}

async function saveSummary(workspaceId, date, items, grandTotalAmount, db = database) {
  await db.query(
    `INSERT INTO daily_summaries (workspace_id, date, items, grand_total_amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, date)
     DO UPDATE SET items = EXCLUDED.items, grand_total_amount = EXCLUDED.grand_total_amount, updated_at = now()`,
    [workspaceId, date, JSON.stringify(items), grandTotalAmount]
  );
}

// -------------------------------------------------------------- share links

async function insertLink(workspaceId, link, db = database) {
  await db.query(
    `INSERT INTO links (workspace_id, transaction_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
    [workspaceId, link.transactionId, link.token, link.expiresAt]
  );
}

// Counts a view of an unexpired link and returns it; a miss says whether the token ever existed.
async function viewLink(token, now = new Date(), db = database) {
  const { rows } = await db.query(
    `UPDATE links SET first_viewed_at = coalesce(first_viewed_at, $2),
            view_count = coalesce(view_count, 0) + 1, updated_at = now()
      WHERE token = $1 AND expires_at > $2
      RETURNING workspace_id, transaction_id, token, expires_at`,
    [token, now]
  );
  if (rows[0])
    return {
      valid: true,
      link: {
        workspaceId: rows[0].workspace_id,
        transactionId: rows[0].transaction_id,
        token: rows[0].token,
        expiresAt: rows[0].expires_at,
      },
    };
  const known = await db.query(`SELECT 1 FROM links WHERE token = $1`, [token]);
  return { valid: false, reason: known.rowCount ? "expired" : "not_found" };
}

// ------------------------------------------------------------ subscriptions

async function getPlan(selector, db = database) {
  if (selector.id) {
    if (!isId(selector.id)) return undefined;
    const { rows } = await db.query(`SELECT * FROM subscription_plans WHERE id = $1`, [selector.id]);
    return plans.toDocument(rows[0]);
  }
  const { rows } = await db.query(
    `SELECT * FROM subscription_plans WHERE name = $1 AND billing_cycle = $2`,
    [selector.name, selector.billingCycle]
  );
  return plans.toDocument(rows[0]);
}

async function getPlanByProviderId(razorpayPlanId, db = database) {
  const { rows } = await db.query(`SELECT * FROM subscription_plans WHERE razorpay_plan_id = $1`, [
    razorpayPlanId,
  ]);
  return plans.toDocument(rows[0]);
}

async function upsertPlan(plan, db = database) {
  await db.query(
    `INSERT INTO subscription_plans
       (name, billing_cycle, price_in_paise, transaction_cap, plan_limits, razorpay_plan_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (name, billing_cycle) DO UPDATE
       SET price_in_paise = EXCLUDED.price_in_paise, transaction_cap = EXCLUDED.transaction_cap,
           plan_limits = EXCLUDED.plan_limits, razorpay_plan_id = EXCLUDED.razorpay_plan_id,
           updated_at = now()`,
    [
      plan.name,
      plan.billingCycle,
      plan.priceInPaise,
      plan.transactionCap,
      JSON.stringify(plan.planLimits),
      plan.razorpayPlanId,
    ]
  );
}

async function currentSubscription(workspaceId, workspace, db = database) {
  const { rows } = await db.query(
    workspace.currentSubscriptionId
      ? `SELECT * FROM workspace_subscriptions WHERE workspace_id = $1 AND razorpay_subscription_id = $2
          ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM workspace_subscriptions WHERE workspace_id = $1 AND status IN ('active', 'halted')
          AND $2::text IS NULL ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, workspace.currentSubscriptionId ?? null]
  );
  return subscriptions.toDocument(rows[0]);
}

async function findSubscription(workspaceId, razorpaySubscriptionId, status, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_subscriptions
      WHERE workspace_id = $1 AND razorpay_subscription_id = $2 AND ($3::text IS NULL OR status = $3)`,
    [workspaceId, razorpaySubscriptionId, status ?? null]
  );
  return subscriptions.toDocument(rows[0]);
}

async function findSubscriptionByProviderId(razorpaySubscriptionId, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM workspace_subscriptions WHERE razorpay_subscription_id = $1`,
    [razorpaySubscriptionId]
  );
  return subscriptions.toDocument(rows[0]);
}

const insertSubscription = (db, workspaceId, data) => subscriptions.insert(db, workspaceId, data);
const updateSubscription = (db, workspaceId, id, changes) =>
  subscriptions.update(db, workspaceId, id, changes);

async function findLinkedAccountFor(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM linked_revenue_accounts WHERE referred_workspace_ids @> $1::jsonb LIMIT 1`,
    [JSON.stringify([workspaceId])]
  );
  return linkedAccounts.toDocument(rows[0]);
}

// Returns false when the provider event was already recorded.
async function recordWebhookEvent(provider, eventId, db = database) {
  const { rowCount } = await db.query(
    `INSERT INTO webhook_events (provider, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [provider, eventId]
  );
  return rowCount > 0;
}

async function webhookEventSeen(provider, eventIds, db = database) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM webhook_events WHERE provider = $1 AND event_id = ANY($2::text[])`,
    [provider, eventIds]
  );
  return rowCount > 0;
}

module.exports = {
  enqueueMessage,
  getMessageJob,
  updateMessageJob,
  claimPendingJob,
  insertNotification,
  getNotification,
  listNotifications,
  latestNotificationFor,
  countNotifications,
  getSummary,
  saveSummary,
  insertLink,
  viewLink,
  getPlan,
  getPlanByProviderId,
  upsertPlan,
  currentSubscription,
  findSubscription,
  findSubscriptionByProviderId,
  insertSubscription,
  updateSubscription,
  findLinkedAccountFor,
  recordWebhookEvent,
  webhookEventSeen,
};
