const crypto = require("crypto");
const operations = require("../repositories/operations");
const env = require("../config/env");

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function createShareLink({ workspaceId, transactionId }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + env.linkToken.ttlHours * 60 * 60 * 1000);
  await operations.insertLink(workspaceId, { transactionId, token, expiresAt });
  return { token, expiresAt };
}

function resolveShareLink(token) {
  return operations.viewLink(token);
}

module.exports = { createShareLink, resolveShareLink };
