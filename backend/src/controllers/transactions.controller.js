const Transaction = require("../models/transaction.model");
const Dealer = require("../models/dealer.model");
const Inventory = require("../models/inventory.model");
const messageQueue = require("../services/messageQueue.service");
const messageBuilder = require("../services/messageBuilder.service");
const pdfService = require("../services/pdf.service");

async function create(req, res) {
  const tx = await Transaction.create({ ...req.body, workspaceId: req.workspaceId });

  // Enqueue rather than call Twilio inline — decouples request latency
  // from Twilio's response time (see services/messageQueue.service.js).
  await messageQueue.enqueue({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
    channel: "whatsapp",
    toPhone: tx.customerPhone,
    body: messageBuilder.buildTransactionReceipt(tx),
  });

  // Auto-decrement inventory stock for this item type (best-effort,
  // don't block the response if the item doesn't exist in inventory).
  try {
    await Inventory.findOneAndUpdate(
      { workspaceId: req.workspaceId, itemType: tx.itemType },
      { $inc: { currentStock: -tx.quantity } }
    );
  } catch (err) {
    // Silently ignore — inventory tracking is optional
  }

  res.status(201).json(tx);
}

async function list(req, res) {
  const { page = 1, limit = 20, paymentMode } = req.query;
  const filter = { workspaceId: req.workspaceId };
  if (paymentMode) filter.paymentMode = paymentMode;

  const transactions = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Transaction.countDocuments(filter);

  res.json({ transactions, total, page: Number(page), limit: Number(limit) });
}

async function getById(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  res.json(tx);
}

async function getReceiptPdf(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const dealer = await Dealer.findOne({ workspaceId: req.workspaceId }).setOptions({
    skipWorkspaceGuard: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${tx._id}.pdf"`);
  pdfService.streamTransactionReceipt(res, {
    businessName: dealer?.businessName || "Satyadev Workspace",
    tx,
  });
}

module.exports = { create, list, getById, getReceiptPdf };
