const { query } = require("../config/postgres");
const { trialLimits } = require("../config/plans");
const { requireWorkspaceId } = require("./workspaceScope");

const database = { query };

const dateFields = ["trialEndsAt", "currentPeriodEnd", "pastDueSince", "createdAt", "updatedAt"];

// row_to_json turns timestamps into strings, so restore them to Dates.
function withDates(row) {
  for (const key of dateFields) if (typeof row[key] === "string") row[key] = new Date(row[key]);
  return row;
}

function withoutNulls(row) {
  return row && Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null));
}

const accountFields = `
  id AS "_id", phone, name, token_version AS "tokenVersion", is_active AS "isActive"
`;
const workspaceFields = `
  id AS "_id", id AS "workspaceId", business_name AS "businessName",
  vertical_type AS "verticalType", language, tax_profile AS "taxProfile", config,
  is_active AS "isActive", trial_ends_at AS "trialEndsAt", plan_name AS "planName",
  subscription_status AS "subscriptionStatus", plan_limits AS "planLimits",
  current_period_end AS "currentPeriodEnd", past_due_since AS "pastDueSince",
  pending_subscription_id AS "pendingSubscriptionId",
  current_subscription_id AS "currentSubscriptionId",
  cancel_at_cycle_end AS "cancelAtCycleEnd", created_at AS "createdAt", updated_at AS "updatedAt"
`;

async function createAccount(input, db) {
  const { rows } = await db.query(
    `INSERT INTO user_accounts (phone, name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING ${accountFields}`,
    [input.phone, input.name, input.passwordHash]
  );
  return withoutNulls(rows[0]);
}

async function getAccount(userId, db = database) {
  const { rows } = await db.query(`SELECT ${accountFields} FROM user_accounts WHERE id = $1`, [
    userId,
  ]);
  return withoutNulls(rows[0]);
}

async function getActiveCredentials(phone, db = database) {
  const { rows } = await db.query(
    `SELECT ${accountFields}, password_hash AS "passwordHash"
       FROM user_accounts WHERE phone = $1 AND is_active`,
    [phone]
  );
  return withoutNulls(rows[0]);
}

async function lockAccount(userId, db) {
  const { rows } = await db.query(
    `SELECT ${accountFields} FROM user_accounts WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  return withoutNulls(rows[0]);
}

async function createOwnedWorkspace(userId, input, db) {
  const { rows } = await db.query(
    `INSERT INTO workspaces (business_name, vertical_type, config, plan_limits)
     VALUES ($1, $2, $3, $4) RETURNING ${workspaceFields}`,
    [input.businessName, input.verticalType, input.config, trialLimits]
  );
  const workspace = withoutNulls(rows[0]);
  const membership = await db.query(
    `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')
     RETURNING id AS "_id", role, workspace_id AS "workspaceId"`,
    [workspace.workspaceId, userId]
  );
  return { workspace, membership: membership.rows[0] };
}

async function getWorkspace(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT ${workspaceFields} FROM workspaces WHERE id = $1 AND is_active`,
    [requireWorkspaceId(workspaceId)]
  );
  return withoutNulls(rows[0]);
}

async function updateWorkspaceSettings(
  workspaceId,
  { businessName, language, config },
  db = database
) {
  const { rows } = await db.query(
    `UPDATE workspaces
        SET business_name = COALESCE($2, business_name),
            language = COALESCE($3, language),
            config = config || $4::jsonb,
            updated_at = now()
      WHERE id = $1
      RETURNING ${workspaceFields}`,
    [requireWorkspaceId(workspaceId), businessName, language, config ?? {}]
  );
  return withoutNulls(rows[0]);
}

async function getActiveMembership(workspaceId, userId, db = database) {
  const { rows } = await db.query(
    `SELECT id AS "_id", workspace_id AS "workspaceId", user_id AS "userId", role
       FROM memberships
      WHERE workspace_id = $1 AND user_id = $2 AND status = 'active'`,
    [requireWorkspaceId(workspaceId), userId]
  );
  return rows[0];
}

async function updateCredentials(userId, passwordHash, expectedVersion, db) {
  const { rows } = await db.query(
    `UPDATE user_accounts
        SET password_hash = COALESCE($2, password_hash), token_version = token_version + 1,
            updated_at = now()
      WHERE id = $1 AND is_active AND ($3::integer IS NULL OR token_version = $3)
      RETURNING ${accountFields}`,
    [userId, passwordHash, expectedVersion]
  );
  return withoutNulls(rows[0]);
}

async function listActiveWorkspacesForAccount(userId, db = database) {
  const { rows } = await db.query(
    `SELECT m.id AS "_id", m.workspace_id AS "workspaceId", m.role, w.workspace
       FROM memberships AS m
       JOIN LATERAL (
         SELECT row_to_json(current_workspace) AS workspace
           FROM (
             SELECT ${workspaceFields}
               FROM workspaces WHERE id = m.workspace_id AND is_active
           ) AS current_workspace
       ) AS w ON w.workspace IS NOT NULL
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY m.last_used_at DESC NULLS LAST, m.created_at, m.id`,
    [userId]
  );
  return rows.map(({ workspace, ...membership }) => ({
    membership,
    workspace: withDates(withoutNulls(workspace)),
  }));
}

async function markWorkspaceUsed(workspaceId, membershipId, db = database) {
  await db.query(
    `UPDATE memberships SET last_used_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2`,
    [requireWorkspaceId(workspaceId), membershipId]
  );
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isId = (value) => typeof value === "string" && UUID.test(value);

const memberFields = `
  m.id AS "_id", m.workspace_id AS "workspaceId", m.user_id AS "userId", m.role, m.status,
  m.invited_by AS "invitedBy", m.last_used_at AS "lastUsedAt",
  m.invite_expires_at AS "inviteExpiresAt", m.created_at AS "createdAt",
  m.updated_at AS "updatedAt"
`;

async function getWorkspaceAnyState(workspaceId, db = database) {
  const { rows } = await db.query(`SELECT ${workspaceFields} FROM workspaces WHERE id = $1`, [
    requireWorkspaceId(workspaceId),
  ]);
  return withoutNulls(rows[0]);
}

async function lockWorkspace(workspaceId, db) {
  const { rows } = await db.query(
    `SELECT ${workspaceFields} FROM workspaces WHERE id = $1 AND is_active FOR NO KEY UPDATE`,
    [requireWorkspaceId(workspaceId)]
  );
  return withoutNulls(rows[0]);
}

async function listActiveWorkspaces(db = database) {
  const { rows } = await db.query(
    `SELECT ${workspaceFields} FROM workspaces WHERE is_active ORDER BY created_at, id`
  );
  return rows.map(withoutNulls);
}

const workspaceColumns = {
  businessName: "business_name",
  language: "language",
  taxProfile: "tax_profile",
  isActive: "is_active",
  planName: "plan_name",
  planLimits: "plan_limits",
  subscriptionStatus: "subscription_status",
  currentPeriodEnd: "current_period_end",
  pastDueSince: "past_due_since",
  pendingSubscriptionId: "pending_subscription_id",
  currentSubscriptionId: "current_subscription_id",
  checkoutAttempt: "checkout_attempt",
  checkoutStartedAt: "checkout_started_at",
  cancelAtCycleEnd: "cancel_at_cycle_end",
};

// Sets the listed camelCase fields (null clears one) and merges `config`. Every key in `when`
// must equal its current value, so a stale checkout reservation updates nothing.
async function patchWorkspace(workspaceId, changes, { when = {}, db = database } = {}) {
  const values = [requireWorkspaceId(workspaceId)];
  const sets = ["updated_at = now()"];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (key === "config") {
      values.push(JSON.stringify(value));
      sets.push(`config = config || $${values.length}::jsonb`);
      continue;
    }
    if (!workspaceColumns[key]) throw new TypeError(`Unknown workspace field: ${key}`);
    values.push(["taxProfile", "planLimits"].includes(key) ? JSON.stringify(value) : value);
    sets.push(`${workspaceColumns[key]} = $${values.length}`);
  }
  const conditions = ["id = $1"];
  for (const [key, value] of Object.entries(when)) {
    if (!workspaceColumns[key]) throw new TypeError(`Unknown workspace field: ${key}`);
    if (value === null) conditions.push(`${workspaceColumns[key]} IS NULL`);
    else {
      values.push(value);
      conditions.push(`${workspaceColumns[key]} = $${values.length}`);
    }
  }
  const { rows } = await db.query(
    `UPDATE workspaces SET ${sets.join(", ")} WHERE ${conditions.join(" AND ")}
      RETURNING ${workspaceFields}`,
    values
  );
  return withoutNulls(rows[0]);
}

async function reserveCheckout(workspaceId, attempt, staleBefore, db = database) {
  const { rows } = await db.query(
    `UPDATE workspaces
        SET checkout_attempt = $2, checkout_started_at = now(), updated_at = now()
      WHERE id = $1 AND is_active
        AND (checkout_attempt IS NULL OR checkout_started_at <= $3)
      RETURNING ${workspaceFields}`,
    [requireWorkspaceId(workspaceId), attempt, staleBefore]
  );
  return withoutNulls(rows[0]);
}

async function releaseCheckout(workspaceId, attempt, db = database) {
  await db.query(
    `UPDATE workspaces SET checkout_attempt = NULL, checkout_started_at = NULL, updated_at = now()
      WHERE id = $1 AND checkout_attempt = $2`,
    [requireWorkspaceId(workspaceId), attempt]
  );
}

async function findAccountByPhone(phone, db = database) {
  const { rows } = await db.query(
    `SELECT ${accountFields}, password_hash AS "passwordHash" FROM user_accounts
      WHERE phone = $1`,
    [phone]
  );
  return withoutNulls(rows[0]);
}

async function createInvitedAccount({ phone, name }, db) {
  const { rows } = await db.query(
    `INSERT INTO user_accounts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING
     RETURNING ${accountFields}`,
    [phone, name]
  );
  return withoutNulls(rows[0]);
}

async function getAccountsByIds(userIds, db = database) {
  const ids = [...new Set(userIds.map(String).filter(isId))];
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT ${accountFields} FROM user_accounts WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.map(withoutNulls);
}

async function getCredentials(userId, db = database) {
  if (!isId(userId)) return undefined;
  const { rows } = await db.query(
    `SELECT ${accountFields}, password_hash AS "passwordHash" FROM user_accounts WHERE id = $1`,
    [userId]
  );
  return withoutNulls(rows[0]);
}

async function setInitialCredentials(userId, passwordHash, name, db) {
  const { rowCount } = await db.query(
    `UPDATE user_accounts SET password_hash = $2, name = COALESCE($3, name), updated_at = now()
      WHERE id = $1 AND password_hash IS NULL`,
    [userId, passwordHash, name]
  );
  return rowCount > 0;
}

async function listMembers(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT ${memberFields}, u.name AS "userName", u.phone AS "userPhone"
       FROM memberships m JOIN user_accounts u ON u.id = m.user_id
      WHERE m.workspace_id = $1 ORDER BY m.created_at, m.id`,
    [requireWorkspaceId(workspaceId)]
  );
  return rows.map(({ userName, userPhone, ...member }) => ({
    member: withoutNulls(member),
    user: { name: userName ?? undefined, phone: userPhone },
  }));
}

async function getMember(workspaceId, memberId, db, { lock = false } = {}) {
  if (!isId(memberId)) return undefined;
  const { rows } = await db.query(
    `SELECT ${memberFields} FROM memberships m WHERE m.workspace_id = $1 AND m.id = $2
     ${lock ? "FOR UPDATE" : ""}`,
    [requireWorkspaceId(workspaceId), memberId]
  );
  return withoutNulls(rows[0]);
}

async function getMemberByUser(workspaceId, userId, db) {
  const { rows } = await db.query(
    `SELECT ${memberFields} FROM memberships m WHERE m.workspace_id = $1 AND m.user_id = $2`,
    [requireWorkspaceId(workspaceId), userId]
  );
  return withoutNulls(rows[0]);
}

async function upsertInvite(workspaceId, userId, invite, db) {
  const { rows } = await db.query(
    `INSERT INTO memberships
       (workspace_id, user_id, role, status, invited_by, invite_token_hash, invite_expires_at)
     VALUES ($1, $2, $3, 'invited', $4, $5, $6)
     ON CONFLICT (workspace_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'invited', invited_by = EXCLUDED.invited_by,
           invite_token_hash = EXCLUDED.invite_token_hash,
           invite_expires_at = EXCLUDED.invite_expires_at, updated_at = now()
     RETURNING id AS "_id", workspace_id AS "workspaceId", user_id AS "userId", role, status,
               last_used_at AS "lastUsedAt", created_at AS "createdAt"`,
    [
      requireWorkspaceId(workspaceId),
      userId,
      invite.role,
      invite.invitedBy,
      invite.inviteTokenHash,
      invite.inviteExpiresAt,
    ]
  );
  return withoutNulls(rows[0]);
}

async function findInvite(workspaceId, tokenHash, db) {
  const { rows } = await db.query(
    `SELECT ${memberFields} FROM memberships m
      WHERE m.workspace_id = $1 AND m.status = 'invited' AND m.invite_token_hash = $2
        AND m.invite_expires_at > now() FOR UPDATE`,
    [requireWorkspaceId(workspaceId), tokenHash]
  );
  return withoutNulls(rows[0]);
}

async function activateInvite(workspaceId, memberId, db) {
  await db.query(
    `UPDATE memberships
        SET status = 'active', last_used_at = now(), invite_token_hash = NULL,
            invite_expires_at = NULL, updated_at = now()
      WHERE workspace_id = $1 AND id = $2`,
    [requireWorkspaceId(workspaceId), memberId]
  );
}

async function updateMember(workspaceId, memberId, { role, status }, db) {
  const { rows } = await db.query(
    `UPDATE memberships SET role = $3, status = $4, updated_at = now()
      WHERE workspace_id = $1 AND id = $2
      RETURNING id AS "_id", workspace_id AS "workspaceId", user_id AS "userId", role, status,
                last_used_at AS "lastUsedAt", created_at AS "createdAt"`,
    [requireWorkspaceId(workspaceId), memberId, role, status]
  );
  return withoutNulls(rows[0]);
}

async function deleteMember(workspaceId, memberId, db) {
  await db.query(`DELETE FROM memberships WHERE workspace_id = $1 AND id = $2`, [
    requireWorkspaceId(workspaceId),
    memberId,
  ]);
}

async function hasOtherActiveOwner(workspaceId, memberId, db) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM memberships
      WHERE workspace_id = $1 AND role = 'owner' AND status = 'active' AND id <> $2 LIMIT 1`,
    [requireWorkspaceId(workspaceId), memberId]
  );
  return rowCount > 0;
}

async function isActiveOwner(workspaceId, userId, db = database) {
  if (!isId(userId)) return false;
  const { rowCount } = await db.query(
    `SELECT 1 FROM memberships
      WHERE workspace_id = $1 AND user_id = $2 AND role = 'owner' AND status = 'active'`,
    [requireWorkspaceId(workspaceId), userId]
  );
  return rowCount > 0;
}

async function countActiveMembers(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM memberships WHERE workspace_id = $1 AND status = 'active'`,
    [requireWorkspaceId(workspaceId)]
  );
  return rows[0].total;
}

async function countSeats(workspaceId, now, db = database) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM memberships
      WHERE workspace_id = $1
        AND (status = 'active' OR (status = 'invited' AND invite_expires_at > $2))`,
    [requireWorkspaceId(workspaceId), now]
  );
  return rows[0].total;
}

async function getOwnerContact(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT u.phone, u.name FROM memberships m JOIN user_accounts u ON u.id = m.user_id
      WHERE m.workspace_id = $1 AND m.role = 'owner' AND m.status = 'active' AND u.is_active
      ORDER BY m.created_at, m.id LIMIT 1`,
    [requireWorkspaceId(workspaceId)]
  );
  return rows[0];
}

async function lockAccountWorkspaceCount(userId, db) {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ["account:" + userId]);
}

module.exports = {
  createAccount,
  getAccount,
  getActiveCredentials,
  lockAccount,
  createOwnedWorkspace,
  getWorkspace,
  updateWorkspaceSettings,
  getActiveMembership,
  updateCredentials,
  listActiveWorkspacesForAccount,
  markWorkspaceUsed,
  isId,
  getWorkspaceAnyState,
  lockWorkspace,
  listActiveWorkspaces,
  patchWorkspace,
  reserveCheckout,
  releaseCheckout,
  findAccountByPhone,
  createInvitedAccount,
  getAccountsByIds,
  getCredentials,
  setInitialCredentials,
  listMembers,
  getMember,
  getMemberByUser,
  upsertInvite,
  findInvite,
  activateInvite,
  updateMember,
  deleteMember,
  hasOtherActiveOwner,
  isActiveOwner,
  countActiveMembers,
  countSeats,
  getOwnerContact,
  lockAccountWorkspaceCount,
};
