const { query } = require("../config/postgres");
const { defineTable, isId } = require("./table");

const database = { query };

const suppliers = defineTable("suppliers");
const purchases = defineTable("purchases", { jsonb: ["lineItems", "charges"] });
const entries = defineTable("supplier_ledger_entries", { omit: ["updatedAt"] });

// ---------------------------------------------------------------- suppliers

async function listSuppliers(workspaceId, { activeOnly }, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM suppliers WHERE workspace_id = $1 ${activeOnly ? "AND is_active" : ""}
      ORDER BY is_active DESC, name, id`,
    [workspaceId]
  );
  return rows.map(suppliers.toDocument);
}

const getSupplier = (db, workspaceId, id, options) => suppliers.get(db, workspaceId, id, options);
const insertSupplier = (db, workspaceId, data) => suppliers.insert(db, workspaceId, data);
const updateSupplier = (db, workspaceId, id, changes, when) =>
  suppliers.update(db, workspaceId, id, changes, when);

async function outstandingSuppliers(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM suppliers WHERE workspace_id = $1 AND balance <> 0 ORDER BY balance DESC, name`,
    [workspaceId]
  );
  return rows.map(suppliers.toDocument);
}

async function partiesWithBalance(workspaceId, table, db = database) {
  const [name, balance] = table === "suppliers" ? ["suppliers", "balance"] : ["customers", "credit_balance"];
  const { rows } = await db.query(
    `SELECT id, name, ${balance} AS balance FROM ${name}
      WHERE workspace_id = $1 AND ${balance} <> 0 ORDER BY name, id`,
    [workspaceId]
  );
  return rows;
}

// ------------------------------------------------------------ ledger entries

const insertEntry = (db, workspaceId, data) => entries.insert(db, workspaceId, data);

async function listEntries(workspaceId, supplierId, { page, limit }, db = database) {
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM supplier_ledger_entries WHERE workspace_id = $1 AND supplier_id = $2
        ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [workspaceId, supplierId, limit, (page - 1) * limit]
    ),
    db.query(
      `SELECT count(*)::int AS total FROM supplier_ledger_entries WHERE workspace_id = $1 AND supplier_id = $2`,
      [workspaceId, supplierId]
    ),
  ]);
  return { entries: rows.rows.map(entries.toDocument), total: count.rows[0].total };
}

async function entriesForAging(workspaceId, supplierIds, db = database) {
  if (!supplierIds.length) return [];
  const { rows } = await db.query(
    `SELECT supplier_id, purchase_id, type, direction, amount, created_at, effective_at
       FROM supplier_ledger_entries WHERE workspace_id = $1 AND supplier_id = ANY($2::uuid[])
      ORDER BY created_at, id`,
    [workspaceId, supplierIds]
  );
  return rows.map((row) => ({
    supplierId: row.supplier_id,
    purchaseId: row.purchase_id,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    createdAt: row.created_at,
    effectiveAt: row.effective_at ?? undefined,
  }));
}

// ---------------------------------------------------------------- purchases

async function listPurchases(workspaceId, { supplierId }, { page, limit }, db = database) {
  if (supplierId !== undefined && !isId(supplierId)) return { purchases: [], total: 0 };
  const values = [workspaceId, supplierId ?? null];
  const where = `workspace_id = $1 AND ($2::uuid IS NULL OR supplier_id = $2)`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM purchases WHERE ${where} ORDER BY invoice_date DESC, id DESC LIMIT $3 OFFSET $4`,
      [...values, limit, (page - 1) * limit]
    ),
    db.query(`SELECT count(*)::int AS total FROM purchases WHERE ${where}`, values),
  ]);
  return { purchases: rows.rows.map(purchases.toDocument), total: count.rows[0].total };
}

const getPurchase = (db, workspaceId, id, options) => purchases.get(db, workspaceId, id, options);
const insertPurchase = (db, workspaceId, data) => purchases.insert(db, workspaceId, data);
const updatePurchase = (db, workspaceId, id, changes, when) =>
  purchases.update(db, workspaceId, id, changes, when);

async function purchaseInvoiceExists(db, workspaceId, supplierId, invoiceNumber) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM purchases WHERE workspace_id = $1 AND supplier_id = $2 AND invoice_number = $3`,
    [workspaceId, supplierId, invoiceNumber]
  );
  return rowCount > 0;
}

async function activePurchaseLines(workspaceId, upTo, db = database) {
  const { rows } = await db.query(
    `SELECT line_items FROM purchases WHERE workspace_id = $1 AND status = 'active' AND invoice_date <= $2`,
    [workspaceId, upTo]
  );
  return rows.map((row) => ({ lineItems: row.line_items }));
}

module.exports = {
  listSuppliers,
  getSupplier,
  insertSupplier,
  updateSupplier,
  outstandingSuppliers,
  partiesWithBalance,
  insertEntry,
  listEntries,
  entriesForAging,
  listPurchases,
  getPurchase,
  insertPurchase,
  updatePurchase,
  purchaseInvoiceExists,
  activePurchaseLines,
};
