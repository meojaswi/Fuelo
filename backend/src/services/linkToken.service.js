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
  const link = await Link.findOne({ token }).setOptions({ skipWorkspaceGuard: true });
  if (!link) return { valid: false, reason: "not_found" };
  if (link.usedAt) return { valid: false, reason: "already_used" };
  if (link.expiresAt < new Date()) return { valid: false, reason: "expired" };

  link.usedAt = new Date();
  await link.save();
  return { valid: true, link };
}

module.exports = { createShareLink, resolveShareLink };
