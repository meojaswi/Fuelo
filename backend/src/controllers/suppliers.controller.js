const Supplier = require("../models/supplier.model");
const Entry = require("../models/supplierLedgerEntry.model");
const { fail } = require("../services/atomic.service");
const { writeTimber } = require("../services/timberWrite.service");
const { postSupplierEntry } = require("../services/supplierLedger.service");
const audit = require("../services/audit.service");

const scopeFor = (req) => ({ workspaceId: req.workspaceId, _id: req.params.id });

async function list(req, res) {
  const filter = { workspaceId: req.workspaceId };
  if (req.query.active === "true") filter.isActive = true;
  res.json({ suppliers: await Supplier.find(filter).sort({ isActive: -1, name: 1, _id: 1 }) });
}

async function get(req, res) {
  const supplier = await Supplier.findOne(scopeFor(req));
  if (!supplier) fail(404, "Supplier not found");
  res.json(supplier);
}

async function create(req, res) {
  const { workspaceId } = req;
  const supplier = await writeTimber(req, "suppliers", async (context) => {
    const created = await new Supplier({ ...req.body, workspaceId }).save({
      session: context.session,
    });
    context.compensate(() => Supplier.deleteOne({ workspaceId, _id: created._id, balance: 0 }));
    if (!created.openingBalance) return created;
    const updated = await postSupplierEntry(
      {
        workspaceId,
        supplierId: created._id,
        type: "adjustment",
        direction: "debit",
        amount: created.openingBalance,
        note: "Opening balance",
        createdBy: req.user.userId,
      },
      context
    );
    return updated.supplier;
  });
  await audit.record(req, {
    action: "supplier.create",
    entityType: "supplier",
    entityId: supplier._id,
    summary: "Added supplier",
  });
  res.status(201).json(supplier);
}

async function update(req, res) {
  const supplier = await writeTimber(req, "suppliers", async ({ session }) => {
    const updated = await Supplier.findOneAndUpdate(
      { ...scopeFor(req), isActive: true },
      { $set: req.body },
      { new: true, session }
    );
    if (!updated) fail(404, "Active supplier not found");
    return updated;
  });
  await audit.record(req, {
    action: "supplier.update",
    entityType: "supplier",
    entityId: supplier._id,
    summary: "Updated supplier",
  });
  res.json(supplier);
}

async function deactivate(req, res) {
  const supplier = await writeTimber(req, "suppliers", async ({ session }) => {
    const scope = scopeFor(req);
    const current = await Supplier.findOne(scope).session(session);
    if (!current) fail(404, "Supplier not found");
    if (!current.isActive) fail(409, "Supplier already inactive");
    if (current.balance) fail(409, "Settle the supplier balance before deactivating");
    return Supplier.findOneAndUpdate(
      { ...scope, balance: 0, isActive: true },
      {
        $set: { isActive: false, deactivationReason: req.body.reason },
      },
      { new: true, session }
    );
  });
  await audit.record(req, {
    action: "supplier.deactivate",
    entityType: "supplier",
    entityId: supplier._id,
    summary: "Deactivated supplier",
    meta: { reason: req.body.reason },
  });
  res.json(supplier);
}

async function ledger(req, res) {
  const supplier = await Supplier.findOne(scopeFor(req));
  if (!supplier) fail(404, "Supplier not found");
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const filter = { workspaceId: req.workspaceId, supplierId: supplier._id };
  const [entries, total] = await Promise.all([
    Entry.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 30)
      .limit(30),
    Entry.countDocuments(filter),
  ]);
  res.json({ supplier, entries, page, total, pages: Math.max(1, Math.ceil(total / 30)) });
}

async function pay(req, res) {
  const { amount, paymentMode, advance, note } = req.body;
  const result = await writeTimber(req, "suppliers", async (context) => {
    const supplier = await Supplier.findOne(scopeFor(req)).session(context.session);
    if (!supplier) fail(404, "Supplier not found");
    if (!supplier.isActive && (advance || supplier.balance <= 0))
      fail(409, "Only outstanding dues can be paid for an inactive supplier");
    return postSupplierEntry(
      {
        workspaceId: req.workspaceId,
        supplierId: supplier._id,
        type: "payment",
        direction: "credit",
        amount,
        paymentMode,
        note,
        createdBy: req.user.userId,
      },
      context,
      { advance }
    );
  });
  await audit.record(req, {
    action: "supplier.payment",
    entityType: "supplier",
    entityId: result.supplier._id,
    summary: "Recorded supplier payment",
    meta: { amount, advance },
  });
  res.status(201).json(result);
}

async function outstanding(req, res) {
  const suppliers = await Supplier.find({ workspaceId: req.workspaceId, balance: { $ne: 0 } }).sort(
    { balance: -1, name: 1 }
  );
  res.json({ suppliers });
}

module.exports = { list, get, create, update, deactivate, ledger, pay, outstanding };
