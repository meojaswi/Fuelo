const timber = require("../repositories/timber");
const { query } = require("../config/postgres");
const { fail } = require("../services/atomic.service");
const { writeTimber } = require("../services/timberWrite.service");
const { postSupplierEntry } = require("../services/supplierLedger.service");
const audit = require("../services/audit.service");

const db = { query };

async function list(req, res) {
  res.json({
    suppliers: await timber.listSuppliers(req.workspaceId, { activeOnly: req.query.active === "true" }),
  });
}

async function get(req, res) {
  const supplier = await timber.getSupplier(db, req.workspaceId, req.params.id);
  if (!supplier) fail(404, "Supplier not found");
  res.json(supplier);
}

async function create(req, res) {
  const { workspaceId } = req;
  const supplier = await writeTimber(req, "suppliers", async (context) => {
    const created = await timber.insertSupplier(context.db, workspaceId, req.body);
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
  const supplier = await writeTimber(req, "suppliers", async ({ db: tdb }) => {
    const updated = await timber.updateSupplier(tdb, req.workspaceId, req.params.id, req.body, {
      isActive: true,
    });
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
  const supplier = await writeTimber(req, "suppliers", async ({ db: tdb }) => {
    const current = await timber.getSupplier(tdb, req.workspaceId, req.params.id, { lock: true });
    if (!current) fail(404, "Supplier not found");
    if (!current.isActive) fail(409, "Supplier already inactive");
    if (current.balance) fail(409, "Settle the supplier balance before deactivating");
    return timber.updateSupplier(
      tdb,
      req.workspaceId,
      current._id,
      { isActive: false, deactivationReason: req.body.reason },
      { balance: 0, isActive: true }
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
  const supplier = await timber.getSupplier(db, req.workspaceId, req.params.id);
  if (!supplier) fail(404, "Supplier not found");
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const { entries, total } = await timber.listEntries(req.workspaceId, supplier._id, {
    page,
    limit: 30,
  });
  res.json({ supplier, entries, page, total, pages: Math.max(1, Math.ceil(total / 30)) });
}

async function pay(req, res) {
  const { amount, paymentMode, advance, note } = req.body;
  const result = await writeTimber(req, "suppliers", async (context) => {
    const supplier = await timber.getSupplier(context.db, req.workspaceId, req.params.id, {
      lock: true,
    });
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
  res.json({ suppliers: await timber.outstandingSuppliers(req.workspaceId) });
}

module.exports = { list, get, create, update, deactivate, ledger, pay, outstanding };
