const { lockWorkspace } = require("../services/workspaceWrite.service");
const { assertCan } = require("../services/entitlements.service");
const { creditAge } = require("../services/fleetCredit.service");
const { checkPump } = require("../middleware/pump.middleware");
const { checkTimber } = require("../middleware/timber.middleware");
const { buildReminder } = require("../services/messageBuilder.service");
const audit = require("../services/audit.service");
const sales = require("../repositories/sales");
const { query } = require("../config/postgres");
const { atomic, fail } = require("../services/atomic.service");
const { postEntry } = require("../services/ledger.service");
const { enqueue } = require("../services/messageQueue.service");
const { buildPaymentReceipt } = require("../services/messageBuilder.service");
const { roundMoney } = require("../utils/money");
const { gstinState } = require("../utils/gst");

const db = { query };

function customerFields(input, existing) {
  const gstin = input.gstin === undefined ? existing?.gstin : input.gstin;
  if (!gstin) return input;
  const state = gstinState(gstin);
  if (input.state && input.state !== state) fail(400, "Customer state must match the GSTIN");
  return { ...input, state };
}

async function create(req, res) {
  const existing = await sales.findCustomerByPhone(db, req.workspaceId, req.body.phone);
  if (existing) return res.status(409).json({ error: "Customer with this phone already exists" });

  let customer;
  try {
    customer = await sales.insertCustomer(db, req.workspaceId, customerFields(req.body));
  } catch (err) {
    if (err.code !== "23505") throw err;
    return res.status(409).json({ error: "Customer with this phone already exists" });
  }
  res.status(201).json(customer);
}

async function list(req, res) {
  const customers = await sales.listCustomers(req.workspaceId, req.query.search);
  res.json({ customers });
}

// Lightweight autocomplete: prefix match on name, capped for UI dropdown use.
async function autocomplete(req, res) {
  const { q } = req.query;
  if (typeof q !== "string" || !q.trim()) return res.json({ customers: [] });
  const customers = await sales.autocompleteCustomers(req.workspaceId, q.trim().slice(0, 100));
  res.json({ customers });
}

async function getById(req, res) {
  const customer = await sales.getCustomer(db, req.workspaceId, req.params.id);
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function update(req, res) {
  const before = await sales.getCustomer(db, req.workspaceId, req.params.id);
  if (!before) fail(404, "Customer not found");
  const customer = await sales.updateCustomer(
    db,
    req.workspaceId,
    req.params.id,
    customerFields(req.body, before)
  );
  if (!customer) fail(404, "Customer not found");
  res.json(customer);
}

async function ledger(req, res) {
  const { workspaceId } = req;
  const customer = await sales.getCustomer(db, workspaceId, req.params.id);
  if (!customer) fail(404, "Customer not found");
  const page = Math.min(1000000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const { entries, total } = await sales.listLedger(workspaceId, customer._id, { page, limit });
  res.json({ entries, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}

async function recordPayment(req, res) {
  const { workspaceId } = req;
  const result = await atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    const options = { workspace, db: context.db };
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
  const customers = await sales.outstandingCustomers(workspaceId);
  const entries = await sales.ledgerForAging(
    workspaceId,
    customers.map((customer) => customer._id)
  );
  const byCustomer = new Map();
  for (const entry of entries) {
    if (!byCustomer.has(entry.customerId)) byCustomer.set(entry.customerId, []);
    byCustomer.get(entry.customerId).push(entry);
  }
  const now = new Date();
  const aged = customers.map((customer) => ({
    ...customer,
    ...creditAge(byCustomer.get(customer._id) ?? [], customer.creditDays, now),
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
    const workspace = await lockWorkspace(workspaceId, context);
    if (workspace.verticalType === "timber") checkTimber(workspace, "dimensions");
    else checkPump(workspace, "vehicleNumber");
    const options = { workspace, db: context.db };
    await assertCan(workspaceId, "write", options);
    await assertCan(workspaceId, "feature:creditLedger", options);
    const existing = await sales.getCustomer(context.db, workspaceId, req.params.id, { lock: true });
    if (!existing) fail(404, "Customer not found");
    if (existing.creditBalance <= 0) fail(409, "Customer has no outstanding dues");
    const updated = await sales.claimReminder(context.db, workspaceId, req.params.id, new Date());
    if (!updated) fail(429, "A dues reminder was already queued in the last 24 hours");
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
