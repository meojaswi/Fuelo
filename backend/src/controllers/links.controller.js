const { transactionScope } = require("../utils/transactionScope");
const Workspace = require("../models/workspace.model");
const Transaction = require("../models/transaction.model");
const linkTokenService = require("../services/linkToken.service");

// Authenticated: dealer generates a share link for a transaction.
async function create(req, res) {
  const transactionId = req.params.id || req.body?.transactionId;

  if (!transactionId) return res.status(400).json({ error: "Transaction ID is required" });
  const tx = await Transaction.findOne({ _id: transactionId, ...transactionScope(req) });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const { token, expiresAt } = await linkTokenService.createShareLink({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
  });

  res.status(201).json({ token, expiresAt, url: `/share/${token}` });
}

// Public: anyone with the link can resolve it until it expires.
async function resolve(req, res) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");

  const result = await linkTokenService.resolveShareLink(req.params.token);
  if (!result.valid) {
    if (result.reason === "expired") {
      return res.status(410).json({ code: "EXPIRED", error: "Receipt link has expired" });
    }
    return res.status(404).json({ code: "NOT_FOUND", error: "Receipt link not found" });
  }

  const { workspaceId, transactionId } = result.link;
  const [transaction, dealer] = await Promise.all([
    Transaction.findOne({ _id: transactionId, workspaceId }).select("-createdBy -voidedBy"),
    Workspace.findOne({ workspaceId }).select("businessName"),
  ]);
  if (!transaction || !dealer) {
    return res.status(404).json({ code: "NOT_FOUND", error: "Receipt not found" });
  }
  res.json({ transaction, businessName: dealer.businessName });
}

module.exports = { create, resolve };
