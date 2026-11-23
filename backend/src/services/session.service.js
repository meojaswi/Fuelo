const { createHash, randomBytes, randomUUID } = require("node:crypto");
const Token = require("../models/refreshToken.model");
const UserAccount = require("../models/userAccount.model");
const Membership = require("../models/membership.model");
const { atomic, fail } = require("./atomic.service");

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function issue(
  user,
  workspaceId,
  userAgent,
  { session = null, familyId = randomUUID() } = {}
) {
  const raw = randomBytes(32).toString("hex");
  const row = await new Token({
    userId: user._id,
    workspaceId,
    tokenVersion: user.tokenVersion,
    familyId,
    tokenHash: digest(raw),
    userAgent: userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + 30 * 86400000),
  }).save({ session });
  return { raw, row };
}

async function rotate(raw, userAgent) {
  if (!validToken(raw)) fail(401, "Invalid refresh token");
  const tokenHash = digest(raw);
  const known = await Token.findOne({ tokenHash });
  if (!known || known.expiresAt <= new Date()) fail(401, "Invalid refresh token");

  const outcome = await atomic(known.workspaceId, async ({ session, compensate }) => {
    const match = { _id: known._id, revokedAt: null, expiresAt: { $gt: new Date() } };
    const current = await Token.findOneAndUpdate(
      match,
      { $set: { revokedAt: new Date() } },
      { new: true, session }
    );
    if (!current) {
      await Token.updateMany(
        { userId: known.userId, familyId: known.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session }
      );
      return null;
    }
    const user = await UserAccount.findById(current.userId).session(session);
    const membership = await Membership.exists({
      workspaceId: current.workspaceId,
      userId: current.userId,
      status: "active",
    }).session(session);
    if (
      !user ||
      user.isActive === false ||
      user.tokenVersion !== current.tokenVersion ||
      !membership
    )
      return null;
    compensate(() =>
      Token.updateOne({ _id: current._id, replacedBy: null }, { $unset: { revokedAt: 1 } })
    );
    const replacement = await issue(user, current.workspaceId, userAgent, {
      session,
      familyId: current.familyId,
    });
    compensate(() => Token.deleteOne({ _id: replacement.row._id }));
    await Token.updateOne(
      { _id: current._id },
      { $set: { replacedBy: replacement.row._id } },
      { session }
    );
    return { user, workspaceId: current.workspaceId, refreshToken: replacement.raw };
  });
  if (!outcome) fail(401, "Invalid refresh token");
  return outcome;
}

async function revoke(raw) {
  if (!validToken(raw)) return;
  const known = await Token.findOne({ tokenHash: digest(raw) });
  if (!known) return;
  await atomic(known.workspaceId, ({ session }) =>
    Token.updateMany(
      {
        userId: known.userId,
        familyId: known.familyId,
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
      { session }
    )
  );
}

async function switchToken(raw, user, workspaceId) {
  if (validToken(raw))
    await Token.updateOne(
      {
        tokenHash: digest(raw),
        userId: user._id,
        tokenVersion: user.tokenVersion,
        revokedAt: null,
      },
      { $set: { workspaceId } }
    );
}

async function revokeAll(userId) {
  await Token.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

module.exports = { issue, rotate, revoke, revokeAll, switchToken, digest };
