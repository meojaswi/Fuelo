const Purchase = require("../models/purchase.model");
const Supplier = require("../models/supplier.model");
const { calculateLines, moveLines } = require("../services/timberStock.service");
const { postSupplierEntry } = require("../services/supplierLedger.service");
const { writeTimber } = require("../services/timberWrite.service");
const { fail } = require("../services/atomic.service");
const { MAX_MONEY, roundMoney } = require("../utils/money");
const { istDayBoundsUTC } = require("../utils/datetime");
const { enqueue } = require("../services/messageQueue.service");
const { buildPurchaseReceived } = require("../services/messageBuilder.service");
const audit = require("../services/audit.service");

const scopeFor = (req) => ({ workspaceId: req.workspaceId, _id: req.params.id });

async function list(req, res) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const filter = { workspaceId: req.workspaceId };
  if (typeof req.query.supplierId === "string") filter.supplierId = req.query.supplierId;
  const [purchases, total] = await Promise.all([
    Purchase.find(filter)
      .sort({ invoiceDate: -1, _id: -1 })
      .skip((page - 1) * 30)
      .limit(30),
    Purchase.countDocuments(filter),
  ]);
  res.json({ purchases, total, page, pages: Math.max(1, Math.ceil(total / 30)) });
}

async function get(req, res) {
  const purchase = await Purchase.findOne(scopeFor(req));
  if (!purchase) fail(404, "Purchase not found");
  res.json(purchase);
}

function ledgerData(purchase, req) {
  return {
    workspaceId: purchase.workspaceId,
    supplierId: purchase.supplierId,
    purchaseId: purchase._id,
    createdBy: req.user.userId,
  };
}

async function create(req, res) {
  const { workspaceId } = req;
  const input = req.body;
  let invoiceStart;
  try {
    invoiceStart = istDayBoundsUTC(input.invoiceDate).startUTC;
  } catch (err) {
    if (!(err instanceof RangeError)) throw err;
    fail(400, "Use a valid invoice date");
  }
  const purchase = await writeTimber(req, "purchases", async (context, workspace) => {
    const { session, compensate } = context;
    const supplier = await Supplier.findOne({
      workspaceId,
      _id: input.supplierId,
      isActive: true,
    }).session(session);
    if (!supplier) fail(404, "Active supplier not found");
    const invoice = { workspaceId, supplierId: supplier._id, invoiceNumber: input.invoiceNumber };
    if (await Purchase.exists(invoice).session(session))
      fail(409, "This supplier invoice number is already recorded");
    const lineItems = await calculateLines(workspaceId, input.lineItems, session, true);
    const total = roundMoney(
      lineItems.reduce((sum, row) => sum + row.lineAmount, 0) +
        input.charges.reduce((sum, row) => sum + row.amount, 0)
    );
    if (total > MAX_MONEY || input.paidAmount > total) fail(400, "Check the total and amount paid");
    const entry = new Purchase({
      ...input,
      workspaceId,
      lineItems,
      total,
      supplierName: supplier.name,
      createdBy: req.user.userId,
    });
    await moveLines(
      entry,
      1,
      { reason: "purchase", purchaseId: entry._id, createdBy: req.user.userId },
      context
    );
    if (total)
      await postSupplierEntry(
        {
          ...ledgerData(entry, req),
          type: "purchase",
          direction: "debit",
          effectiveAt: invoiceStart,
          amount: total,
        },
        context
      );
    if (input.paidAmount)
      await postSupplierEntry(
        {
          ...ledgerData(entry, req),
          type: "payment",
          direction: "credit",
          amount: input.paidAmount,
          paymentMode: input.paymentMode,
        },
        context,
        { advance: true }
      );
    await entry.save({ session });
    compensate(() => Purchase.deleteOne({ workspaceId, _id: entry._id }));
    if (supplier.phone)
      await enqueue(
        {
          workspaceId,
          channel: "whatsapp",
          toPhone: supplier.phone.length === 10 ? "+91" + supplier.phone : supplier.phone,
          body: buildPurchaseReceived(workspace, entry),
        },
        context
      );
    return entry;
  });
  await audit.record(req, {
    action: "purchase.create",
    entityType: "purchase",
    entityId: purchase._id,
    summary: "Recorded timber purchase",
  });
  res.status(201).json(purchase);
}

async function voidPurchase(req, res) {
  const purchase = await writeTimber(req, "purchases", async (context, workspace) => {
    const { session, compensate } = context;
    const scope = scopeFor(req);
    const original = await Purchase.findOne(scope).session(session);
    if (!original) fail(404, "Purchase not found");
    if (original.status !== "active") fail(409, "Purchase already voided");
    await moveLines(
      original,
      -1,
      { reason: "purchase_void", purchaseId: original._id, createdBy: req.user.userId },
      context
    );
    if (original.total)
      await postSupplierEntry(
        {
          ...ledgerData(original, req),
          type: "void_reversal",
          direction: "credit",
          amount: original.total,
          note: req.body.reason,
        },
        context
      );
    const result = await Purchase.findOneAndUpdate(
      { ...scope, status: "active" },
      {
        $set: {
          status: "voided",
          voidedAt: new Date(),
          voidedBy: req.user.userId,
          voidedReason: req.body.reason,
        },
      },
      { new: true, session }
    );
    if (!result) fail(409, "Purchase already voided");
    compensate(() =>
      Purchase.updateOne(scope, {
        $set: { status: "active" },
        $unset: { voidedAt: 1, voidedBy: 1, voidedReason: 1 },
      })
    );
    return result;
  });
  await audit.record(req, {
    action: "purchase.void",
    entityType: "purchase",
    entityId: purchase._id,
    summary: "Voided timber purchase",
    meta: { reason: req.body.reason },
  });
  res.json(purchase);
}

module.exports = { list, get, create, voidPurchase };
