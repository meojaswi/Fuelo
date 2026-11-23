const { lockWorkspace } = require("../services/workspaceWrite.service");
const { assertCan } = require("../services/entitlements.service");
const { creditAge } = require("../services/fleetCredit.service");
const { checkPump } = require("../middleware/pump.middleware");
const { checkTimber } = require("../middleware/timber.middleware");
const { buildReminder } = require("../services/messageBuilder.service");
const audit = require("../services/audit.service");
const LedgerEntry = require("../models/ledgerEntry.model");
const { atomic, fail } = require("../services/atomic.service");
const { postEntry } = require("../services/ledger.service");
const { enqueue } = require("../services/messageQueue.service");
const { buildPaymentReceipt } = require("../services/messageBuilder.service");
const { roundMoney } = require("../utils/money");
const { gstinState } = require("../utils/gst");
const Customer = require("../models/customer.model");

function customerFields(input, existing) {
  const gstin = input.gstin === undefined ? existing?.gstin : input.gstin;
  if (!gstin) return input;
  const state = gstinState(gstin);
  if (input.state && input.state !== state) fail(400, "Customer state must match the GSTIN");
  return { ...input, state };
}

async function create(req, res) {
  const existing = await Customer.findOne({ workspaceId: req.workspaceId, phone: req.body.phone });
  if (existing) return res.status(409).json({ error: "Customer with this phone already exists" });

  const customer = await Customer.create({
    ...customerFields(req.body),
    workspaceId: req.workspaceId,
  });
  res.status(201).json(customer);
}

async function list(req, res) {
  const { search } = req.query;
  const filter = { workspaceId: req.workspaceId };
  if (search) filter.$text = { $search: search };

  const customers = await Customer.find(filter).sort({ name: 1 }).limit(50);
  res.json({ customers });
}

// Lightweight autocomplete — prefix match on name, capped for UI dropdown use.
async function autocomplete(req, res) {
  const { q } = req.query;
  if (typeof q !== "string" || !q.trim()) return res.json({ customers: [] });

  const prefix = q
    .trim()
    .slice(0, 100)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const customers = await Customer.find({
    workspaceId: req.workspaceId,
    name: { $regex: `^${prefix}`, $options: "i" },
  })
    .select("name phone isCreditCustomer vehicles gstin billingAddress state")
    .limit(10);

  res.json({ customers });
}

async function getById(req, res) {
  const customer = await Customer.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function update(req, res) {
  const scope = { workspaceId: req.workspaceId, _id: req.params.id };
  const before = await Customer.findOne(scope);
  if (!before) fail(404, "Customer not found");
  const customer = await Customer.findOneAndUpdate(
    scope,
    { $set: customerFields(req.body, before) },
    { new: true, runValidators: true }
  );
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function ledger(req, res) {
  const { workspaceId } = req;
  const customer = await Customer.findOne({ workspaceId, _id: req.params.id });
  if (!customer) fail(404, "Customer not found");
  const page = Math.min(1000000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = { workspaceId, customerId: customer._id };
  const [entries, total] = await Promise.all([
    LedgerEntry.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    LedgerEntry.countDocuments(filter),
  ]);
  res.json({ entries, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function recordPayment(req, res) {
  const { workspaceId } = req;
  const result = await atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    const options = { workspace, session: context.session };
    await assertCan(workspaceId, "write", options);
    await assertCan(workspaceId, "feature:creditLedger", options);
    const { entry, customer } = await postEntry(
      {
        ...req.body,
        workspaceId,
        customerId: req.params.id,
        type: "payment",
        direction: "credit",
        createdBy: req.user.userId,
      },
      context,
      {
        allowAdvance:
          workspace.verticalType === "timber" && workspace.config?.allowAdvances === true,
      }
    );
    await enqueue(
      {
        workspaceId,
        channel: "whatsapp",
        toPhone: customer.phone,
        body: buildPaymentReceipt({
          workspace,
          amount: entry.amount,
          remainingBalance: entry.balanceAfter,
        }),
      },
      context
    );
    return { entry, customer };
  });
  await audit.record(req, {
    action: "payment.record",
    entityType: "ledgerEntry",
    entityId: result.entry._id,
    summary: "Recorded a customer payment",
    meta: { amount: result.entry.amount, paymentMode: result.entry.paymentMode },
  });
  res.status(201).json(result);
}

async function outstanding(req, res) {
  const { workspaceId } = req;
  const overdue = req.query.minDaysOverdue;
  if (overdue !== undefined && (typeof overdue !== "string" || !/^\d{1,5}$/.test(overdue)))
    fail(400, "minDaysOverdue must be a non-negative integer");
  const customers = await Customer.aggregate([
    { $match: { workspaceId, creditBalance: { $gt: 0 } } },
    { $sort: { creditBalance: -1, _id: 1 } },
    {
      $lookup: {
        from: LedgerEntry.collection.name,
        localField: "_id",
        foreignField: "customerId",
        as: "payments",
        pipeline: [
          { $match: { workspaceId, type: "payment" } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 1 },
          { $project: { createdAt: 1, _id: 0 } },
        ],
      },
    },
    { $set: { lastPaymentAt: { $ifNull: [{ $first: "$payments.createdAt" }, null] } } },
    { $unset: "payments" },
  ]);
  const entries = await LedgerEntry.find({
    workspaceId,
    customerId: { $in: customers.map((customer) => customer._id) },
  })
    .select("customerId type direction amount transactionId createdAt")
    .sort({ customerId: 1, createdAt: 1, _id: 1 })
    .lean();
  const byCustomer = new Map();
  for (const entry of entries) {
    const key = String(entry.customerId);
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(entry);
  }
  const now = new Date();
  const aged = customers.map((customer) => ({
    ...customer,
    ...creditAge(byCustomer.get(String(customer._id)) ?? [], customer.creditDays, now),
  }));
  const matching =
    overdue === undefined
      ? aged
      : aged.filter(({ daysOverdue }) => daysOverdue !== null && daysOverdue >= Number(overdue));
  res.json({
    customers: matching,
    totalOutstanding: roundMoney(
      matching.reduce((total, customer) => total + customer.creditBalance, 0)
    ),
  });
}

async function remind(req, res) {
  const { workspaceId } = req;
  const customer = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    if (workspace.verticalType === "timber") checkTimber(workspace, "dimensions");
    else checkPump(workspace, "vehicleNumber");
    await assertCan(workspaceId, "write", { workspace, session });
    await assertCan(workspaceId, "feature:creditLedger", { workspace, session });
    const filter = { workspaceId, _id: req.params.id };
    const now = new Date();
    const existing = await Customer.findOne(filter).session(session);
    if (!existing) fail(404, "Customer not found");
    if (existing.creditBalance <= 0) fail(409, "Customer has no outstanding dues");
    const updated = await Customer.findOneAndUpdate(
      {
        ...filter,
        creditBalance: { $gt: 0 },
        $or: [{ lastReminderAt: null }, { lastReminderAt: { $lte: new Date(+now - 86400000) } }],
      },
      { $set: { lastReminderAt: now } },
      { new: true, session }
    );
    if (!updated) fail(429, "A dues reminder was already queued in the last 24 hours");
    compensate(() =>
      Customer.updateOne(
        { ...filter, lastReminderAt: now },
        existing.lastReminderAt
          ? { $set: { lastReminderAt: existing.lastReminderAt } }
          : { $unset: { lastReminderAt: 1 } }
      )
    );
    await enqueue(
      {
        workspaceId,
        channel: "whatsapp",
        toPhone: updated.phone.length === 10 ? "+91" + updated.phone : updated.phone,
        ...buildReminder(workspace, updated),
      },
      context
    );
    return updated;
  });
  await audit.record(req, {
    action: "credit.reminder",
    entityType: "customer",
    entityId: customer._id,
    summary: "Queued a customer dues reminder",
    meta: { amount: customer.creditBalance },
  });
  res.status(202).json({ queued: true, lastReminderAt: customer.lastReminderAt });
}

module.exports = {
  create,
  list,
  autocomplete,
  getById,
  update,
  ledger,
  recordPayment,
  outstanding,
  remind,
};
