const crypto = require("crypto");
const Link = require("../models/link.model");
const env = require("../config/env");

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function createShareLink({ workspaceId, transactionId }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env.linkToken.ttlHours * 60 * 60 * 1000);

  await Link.create({ workspaceId, transactionId, token, expiresAt });
  return { token, expiresAt };
}

async function resolveShareLink(token) {
  const now = new Date();
  const link = await Link.findOneAndUpdate(
    { token, expiresAt: { $gt: now } },
    [
      {
        $set: {
          firstViewedAt: { $ifNull: ["$firstViewedAt", { $ifNull: ["$usedAt", now] }] },
          viewCount: { $add: [{ $ifNull: ["$viewCount", 0] }, 1] },
        },
      },
    ],
    { new: true, skipWorkspaceGuard: true }
  );
  if (link) return { valid: true, link };

  const exists = await Link.exists({ token }).setOptions({ skipWorkspaceGuard: true });
  return { valid: false, reason: exists ? "expired" : "not_found" };
}

module.exports = { createShareLink, resolveShareLink };
