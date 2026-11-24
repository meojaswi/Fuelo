const { createHash, randomBytes, randomUUID } = require("node:crypto");
const tokens = require("../repositories/refreshTokens");
const identity = require("../repositories/identity");
const { withTransaction } = require("../config/postgres");
const { fail } = require("./atomic.service");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function issue(user, workspaceId, userAgent, { db, familyId = randomUUID() } = {}) {
  const raw = randomBytes(32).toString("hex");
  const row = await tokens.insert(
    workspaceId,
    {
      userId: user._id,
      tokenVersion: user.tokenVersion,
      familyId,
      tokenHash: digest(raw),
      userAgent: userAgent?.slice(0, 300),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
    db
  );
  return { raw, row };
}

async function rotate(raw, userAgent) {
  if (!validToken(raw)) fail(401, "Invalid refresh token");
  const known = await tokens.findUnexpiredByHash(digest(raw));
  if (!known) fail(401, "Invalid refresh token");

  const outcome = await withTransaction(async (db) => {
    const current = await tokens.claimForRotation(known.workspaceId, known._id, db);
    if (!current) {
      // A reused token means the family may be stolen, so revoke all of it.
      await tokens.revokeFamily(known.userId, known.familyId, db);
      return null;
    }
    const user = await identity.getAccount(current.userId, db);
    const membership = await identity.getActiveMembership(current.workspaceId, current.userId, db);
    if (
      !user ||
      user.isActive === false ||
      user.tokenVersion !== current.tokenVersion ||
      !membership
    )
      return null;
    const replacement = await issue(user, current.workspaceId, userAgent, {
      db,
      familyId: current.familyId,
    });
    await tokens.setReplacement(current.workspaceId, current._id, replacement.row._id, db);
    return { user, workspaceId: current.workspaceId, refreshToken: replacement.raw };
  });
  if (!outcome) fail(401, "Invalid refresh token");
  return outcome;
}

async function revoke(raw) {
  if (!validToken(raw)) return;
  const known = await tokens.findUnexpiredByHash(digest(raw));
  if (known) await tokens.revokeFamily(known.userId, known.familyId);
}

async function switchToken(raw, user, workspaceId) {
  if (validToken(raw))
    await tokens.switchWorkspace(workspaceId, digest(raw), user._id, user.tokenVersion);
}

async function revokeAll(userId, db) {
  await tokens.revokeAllForAccount(userId, db);
}

module.exports = { issue, rotate, revoke, revokeAll, switchToken, digest };
