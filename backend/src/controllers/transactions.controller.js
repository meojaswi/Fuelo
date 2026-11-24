const { transactionScope } = require("../utils/transactionScope");
const { lockWorkspace } = require("../services/workspaceWrite.service");
const { assertCan } = require("../services/entitlements.service");
const audit = require("../services/audit.service");
const identity = require("../repositories/identity");
const Shift = require("../models/shift.model");
const Customer = require("../models/customer.model");
const { getVertical } = require("../config/verticals");
const { normalizeVehicle, hasUnusualFormat } = require("../utils/vehicleNumber");
const Notification = require("../models/notification.model");
const { istDayBoundsUTC } = require("../utils/datetime");
const Transaction = require("../models/transaction.model");
const { atomic, fail } = require("../services/atomic.service");
const { MAX_MONEY, roundMoney, priceForQuantity } = require("../utils/money");
const { changeStock } = require("../services/stock.service");
const { recordCreditSale, reverseCreditSale } = require("../services/ledger.service");
const messageQueue = require("../services/messageQueue.service");
const messageBuilder = require("../services/messageBuilder.service");
const pdfService = require("../services/pdf.service");
const { createTimberSale, reverseTimberSale } = require("../services/timberSales.service");

async function create(req, res) {
  const { workspaceId } = req;
  const { override, vehicleNumber, ...sale } = req.body;
  const { tx, usage } = await atomic(workspaceId, async (context) => {
    const dealer = await lockWorkspace(workspaceId, context);
    const options = { workspace: dealer, session: context.session };
    const usage = await assertCan(workspaceId, "transaction:create", options);
    if (sale.lineItems) {
      const tx = await createTimberSale(
        req,
        dealer,
        sale,
        override && req.user.role !== "attendant",
        context
      );
      return { tx, usage };
    }
    if (dealer.verticalType === "timber") fail(400, "Add timber dimension lines to this sale");
    if (sale.paymentMode === "credit")
      await assertCan(workspaceId, "feature:creditLedger", options);
    const features = getVertical(dealer.verticalType).flags;
    const shift =
      features.shifts &&
      (await Shift.findOne({ workspaceId, status: "open" }).select("_id").session(context.session));
    const vehicle = features.vehicleNumber ? normalizeVehicle(vehicleNumber) : undefined;
    const transaction = new Transaction({
      ...sale,
      workspaceId,
      createdBy: req.user.userId,
      shiftId: shift?._id,
      vehicleNumber: vehicle,
      vehicleNumberWarning: hasUnusualFormat(vehicle) || undefined,
    });
    const inventory = await changeStock(
      {
        filter: { workspaceId, itemType: transaction.itemType },
        delta: -transaction.quantity,
        reason: "sale",
        transactionId: transaction._id,
        createdBy: req.user.userId,
        allowNegative: dealer.config?.allowNegativeStock === true,
      },
      context
    );
    if (inventory) {
      transaction.inventoryId = inventory._id;
      transaction.tankChanges = inventory.$locals.tankChanges;
      if (transaction.tankChanges.length) transaction.quantity = roundMoney(transaction.quantity);
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
        req.user.userId,
        override && req.user.role !== "attendant",
        context
      );
      if (vehicle) {
        const customerScope = { workspaceId, _id: transaction.customerId };
        const added = await Customer.updateOne(
          { ...customerScope, "vehicles.number": { $ne: vehicle } },
          { $push: { vehicles: { number: vehicle } } },
          { session: context.session }
        );
        if (added.modifiedCount)
          context.compensate(() =>
            Customer.updateOne(customerScope, { $pull: { vehicles: { number: vehicle } } })
          );
      }
    }
    await transaction.save({ session: context.session });
    context.compensate(() => Transaction.deleteOne({ workspaceId, _id: transaction._id }));
    await messageQueue.enqueue(
      {
        workspaceId,
        transactionId: transaction._id,
        channel: "whatsapp",
        toPhone: transaction.customerPhone,
        body: messageBuilder.buildTransactionReceipt(transaction, dealer),
      },
      context
    );
    return { tx: transaction, usage };
  });

  if (tx.paymentMode === "credit" && override && req.user.role !== "attendant") {
    await audit.record(req, {
      action: "credit.override",
      entityType: "transaction",
      entityId: tx._id,
      summary: "Credit limit override used",
      meta: { amount: tx.amount },
    });
  }
  if (usage?.nearTransactionCap) res.set("X-Fuelo-Usage-Warning", "MONTHLY_TRANSACTIONS_80");
  res.status(201).json({
    ...tx.toObject(),
    ...(usage?.nearTransactionCap && { usageWarning: "MONTHLY_TRANSACTIONS_80" }),
  });
}

async function voidSale(req, res) {
  const { workspaceId } = req;
  const scope = { workspaceId, _id: req.params.id };
  const transaction = await atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    const { session, compensate } = context;
    await assertCan(workspaceId, "write", { workspace, session });
    const tx = await Transaction.findOneAndUpdate(
      { ...scope, status: "active" },
      {
        $set: {
          status: "voided",
          voidedReason: req.body.reason,
          voidedAt: new Date(),
          voidedBy: req.user.userId,
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
    if (
      tx.shiftId &&
      (await Shift.exists({ workspaceId, _id: tx.shiftId, status: "closed" }).session(session))
    ) {
      fail(409, "Reopen the shift before voiding one of its sales");
    }
    if (tx.lineItems?.length) {
      if (tx.invoice?.type === "tax_invoice")
        fail(409, "Issue a credit note to reverse this tax invoice", "CREDIT_NOTE_REQUIRED");
      await reverseTimberSale(tx, req.user.userId, context);
      return tx;
    }
    if (tx.inventoryId) {
      await changeStock(
        {
          filter: { workspaceId, _id: tx.inventoryId, itemType: tx.itemType },
          delta: tx.quantity,
          reason: "void",
          allowOverflow: true,
          tankChanges: tx.tankChanges?.length
            ? tx.tankChanges.map(({ tankId, delta }) => ({ tankId, delta: -delta }))
            : undefined,
          transactionId: tx._id,
          createdBy: req.user.userId,
        },
        context
      );
    }
    if (tx.paymentMode === "credit") await reverseCreditSale(tx, req.user.userId, context);
    return tx;
  });
  await audit.record(req, {
    action: "transaction.void",
    entityType: "transaction",
    entityId: transaction._id,
    summary: "Voided a sale",
  });
  res.json(transaction);
}

async function list(req, res) {
  const { paymentMode, customer, itemTypes, today } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = transactionScope(req);
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
  const tx = await Transaction.findOne({ _id: req.params.id, ...transactionScope(req) });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });
  const notification = await Notification.findOne({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
  }).sort({ createdAt: -1, _id: -1 });
  const [actor] = tx.createdBy ? await identity.getAccountsByIds([tx.createdBy]) : [];
  res.json({
    ...tx.toObject(),
    recordedBy: actor?.name,
    notificationId: notification?._id,
    notificationStatus: notification?.status ?? "pending",
  });
}

async function getReceiptPdf(req, res) {
  const tx = await Transaction.findOne({ _id: req.params.id, ...transactionScope(req) });
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const dealer = await identity.getWorkspaceAnyState(req.workspaceId);
  if (!dealer) return res.status(404).json({ error: "Workspace not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="receipt-${tx._id}.pdf"`);
  if (tx.invoice?.type === "tax_invoice") return pdfService.streamTaxInvoice(res, tx);
  pdfService.streamTransactionReceipt(res, {
    businessName: dealer.businessName,
    tx,
  });
}

module.exports = { create, list, getById, getReceiptPdf, voidSale };
