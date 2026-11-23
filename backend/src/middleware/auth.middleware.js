const jwt = require("jsonwebtoken");
const env = require("../config/env");
const UserAccount = require("../models/userAccount.model");
const Membership = require("../models/membership.model");
const Workspace = require("../models/workspace.model");

const cache = new Map();
const TTL = 30_000;

function invalidateAuth({ userId, workspaceId }) {
  for (const [key, entry] of cache) {
    if (
      (!userId || entry.userId === String(userId)) &&
      (!workspaceId || entry.workspaceId === workspaceId)
    )
      cache.delete(key);
  }
}

async function authorize(req, res, next, fresh = false) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  const { userId, workspaceId, tokenVersion } = payload;
  if (
    typeof userId !== "string" ||
    !/^[a-f0-9]{24}$/.test(userId) ||
    typeof workspaceId !== "string" ||
    !Number.isInteger(tokenVersion)
  ) {
    return res.status(401).json({ error: "Invalid session" });
  }

  try {
    const key = userId + ":" + workspaceId;
    let entry = cache.get(key);
    if (fresh || !entry || entry.expiresAt <= Date.now()) {
      const expiresAt = Date.now() + TTL;
      const [user, membership, workspace] = await Promise.all([
        UserAccount.findById(userId).select("tokenVersion isActive"),
        Membership.findOne({ workspaceId, userId, status: "active" }).select("role"),
        Workspace.findOne({ workspaceId, isActive: true }).select("_id"),
      ]);
      entry = { userId, workspaceId, expiresAt, user, membership, workspace };
      if (cache.size >= 4096) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
    }
    if (
      !entry.user ||
      entry.user.isActive === false ||
      entry.user.tokenVersion !== tokenVersion ||
      !entry.membership ||
      !entry.workspace
    ) {
      return res.status(401).json({ error: "Session no longer active" });
    }
    req.user = { ...payload, role: entry.membership.role };
    next();
  } catch (err) {
    next(err);
  }
}

const requireAuth = (req, res, next) => authorize(req, res, next);
const requireFreshAuth = (req, res, next) => authorize(req, res, next, true);

module.exports = { requireAuth, requireFreshAuth, invalidateAuth };
