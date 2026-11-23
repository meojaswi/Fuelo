const Notification = require("../models/notification.model");
const { istDayBoundsUTC } = require("../utils/datetime");
const Transaction = require("../models/transaction.model");
const Dealer = require("../models/dealer.model");
const { atomic, fail } = require("../services/atomic.service");
const { MAX_MONEY, roundMoney, priceForQuantity } = require("../utils/money");
const { changeStock } = require("../services/stock.service");
const { recordCreditSale, reverseCreditSale } = require("../services/ledger.service");
const messageQueue = require("../services/messageQueue.service");
const messageBuilder = require("../services/messageBuilder.service");
const pdfService = require("../services/pdf.service");

async function create(req, res) {
  const { workspaceId } = req;
  const dealer = await Dealer.findOne({ workspaceId }).select("businessName config");
  if (!dealer) return res.status(404).json({ error: "Workspace not found" });

  const { override, ...sale } = req.body;
  const tx = await atomic(workspaceId, async (context) => {
    const transaction = new Transaction({ ...sale, workspaceId });
    const inventory = await changeStock(
      {
        filter: { workspaceId, itemType: transaction.itemType },
        delta: -transaction.quantity,
        reason: "sale",
        transactionId: transaction._id,
        createdBy: req.user.dealerId,
        allowNegative: dealer.config?.allowNegativeStock === true,
      },
      context
    );
    if (inventory) {
      transaction.inventoryId = inventory._id;
      transaction.unit = inventory.unit;
      const expected = priceForQuantity(inventory.pricePerUnit, transaction.quantity);
      if (!Number.isFinite(expected) || expected > MAX_MONEY) {
        fail(400, "Quantity and price produce an amount outside the supported range");
      }
      transaction.expectedAmount = expected;
      transaction.priceMismatch =
        Math.abs(roundMoney(transaction.amount - transaction.expectedAmount)) > 1;
    }
    if (transaction.paymentMode === "credit") {
      transaction.customerId = await recordCreditSale(
        transaction,
        req.user.dealerId,
        override,
        context
      );
    }
    await transaction.save({ session: context.session });
    context.compensate(() => Transaction.deleteOne({ workspaceId, _id: transaction._id }));
    await messageQueue.enqueue(
      {
        workspaceId,
        transactionId: transaction._id,
        channel: "whatsapp",
        toPhone: transaction.customerPhone,
        body: messageBuilder.buildTransactionReceipt(transaction, dealer.businessName),
      },
      context
    );
    return transaction;
  });

  res.status(201).json(tx);
}

async function voidSale(req, res) {
  const { workspaceId } = req;
  const scope = { workspaceId, _id: req.params.id };
  const transaction = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    const tx = await Transaction.findOneAndUpdate(
      { ...scope, status: "active" },
      {
        $set: {
          status: "voided",
          voidedReason: req.body.reason,
          voidedAt: new Date(),
          voidedBy: req.user.dealerId,
        },
      },
      { new: true, session }
    );
    if (!tx) {
      if (await Transaction.exists(scope).session(session))
        fail(409, "Transaction is already voided");
      fail(404, "Transaction not found");
    }
    compensate(() =>
      Transaction.updateOne(scope, {
        $set: { status: "active" },
        $unset: { voidedReason: 1, voidedAt: 1, voidedBy: 1 },
      })
    );
    if (tx.inventoryId) {
      await changeStock(
        {
          filter: { workspaceId, _id: tx.inventoryId, itemType: tx.itemType },
          delta: tx.quantity,
          reason: "void",
          transactionId: tx._id,
          createdBy: req.user.dealerId,
        },
        context
      );
    }
    if (tx.paymentMode === "credit") await reverseCreditSale(tx, req.user.dealerId, context);
    return tx;
  });
  res.json(transaction);
}

async function list(req, res) {
  const { paymentMode, customer, itemTypes, today } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { workspaceId: req.workspaceId };
  if (paymentMode) filter.paymentMode = paymentMode;
  if (typeof customer === "string" && customer.trim()) {
    const search = customer
      .trim()
      .slice(0, 100)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.customerName = { $regex: search, $options: "i" };
  }
  if (typeof itemTypes === "string" && itemTypes) filter.itemType = { $in: itemTypes.split(",") };
  if (today === "true") {
    filter.status = "active";
    const { startUTC, endUTC } = istDayBoundsUTC(new Date());
    filter.createdAt = { $gte: startUTC, $lt: endUTC };
  }

  const transactions = await Transaction.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  const total = await Transaction.countDocuments(filter);

  res.json({ transactions, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function getById(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  const notification = await Notification.findOne({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
  }).sort({ createdAt: -1, _id: -1 });
  res.json({
    ...tx.toObject(),
    notificationId: notification?._id,
    notificationStatus: notification?.status ?? "pending",
  });
}

async function getReceiptPdf(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, workspaceId: req.workspaceId });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const dealer = await Dealer.findOne({ workspaceId: req.workspaceId }).select("businessName");
  if (!dealer) return res.status(404).json({ error: "Workspace not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${tx._id}.pdf"`);
  pdfService.streamTransactionReceipt(res, {
    businessName: dealer.businessName,
    tx,
  });
}

module.exports = { create, list, getById, getReceiptPdf, voidSale };
