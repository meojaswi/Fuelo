const Transaction = require("../models/transaction.model");
const linkTokenService = require("../services/linkToken.service");

// Authenticated: dealer generates a share link for a transaction.
async function create(req, res) {
  const { transactionId } = req.body;

  const tx = await Transaction.findOne({ _id: transactionId, workspaceId: req.workspaceId });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const { token, expiresAt } = await linkTokenService.createShareLink({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
  });

  res.status(201).json({ token, expiresAt, url: `/share/${token}` });
}

// Public: anyone with the link resolves it, one-time use.
async function resolve(req, res) {
  const result = await linkTokenService.resolveShareLink(req.params.token);
  if (!result.valid) return res.status(410).json({ error: result.reason });

  const tx = await Transaction.findOne({
    _id: result.link.transactionId,
    workspaceId: result.link.workspaceId,
  });
  res.json({ transaction: tx });
}

module.exports = { create, resolve };
