const { query } = require("../config/postgres");
const { defineTable, isId } = require("./table");

const database = { query };

const customers = defineTable("customers", {
  columns: [
    "name", "phone", "isCreditCustomer", "creditBalance", "gstin", "billingAddress", "state",
    "vehicles", "creditDays", "lastReminderAt", "creditLimit",
  ],
  jsonb: ["vehicles"],
  keepNull: ["creditDays", "creditLimit"],
});
const ledger = defineTable("ledger_entries", { omit: ["updatedAt"] });
const inventory = defineTable("inventory", { omit: ["removedAt"] });
const movements = defineTable("stock_movements", { jsonb: ["tankChanges"], omit: ["updatedAt"] });
const priceHistory = defineTable("price_history");
const transactions = defineTable("transactions", {
  jsonb: ["lineItems", "charges", "invoice", "tankChanges"],
  columns: [
    "customerId", "customerName", "customerPhone", "itemType", "quantity", "unit", "amount",
    "lineItems", "charges", "paidAmount", "creditAmount", "advanceApplied", "invoiceNumber",
    "invoice", "creditNoteId", "expectedAmount", "priceMismatch", "paymentMode", "upiReference",
    "notes", "createdBy", "shiftId", "vehicleNumber", "vehicleNumberWarning", "tankChanges",
    "inventoryId", "voidedAt", "voidedReason", "voidedBy", "status", "createdAt", "updatedAt",
  ],
});
const creditNotes = defineTable("credit_notes");

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

// ---------------------------------------------------------------- customers

const getCustomer = (db, workspaceId, id, options) => customers.get(db, workspaceId, id, options);

async function findCustomerByPhone(db, workspaceId, phone, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM customers WHERE workspace_id = $1 AND phone = $2 ${lock ? "FOR UPDATE" : ""}`,
    [workspaceId, phone]
  );
  return customers.toDocument(rows[0]);
}

// Returns undefined when another request created the customer first.
async function insertCustomerIfAbsent(db, workspaceId, data) {
  const entries = customers.toColumns({ ...data, workspaceId });
  const { rows } = await db.query(
    `INSERT INTO customers (${entries.map(([column]) => column).join(", ")})
     VALUES (${entries.map((_, index) => "$" + (index + 1)).join(", ")})
     ON CONFLICT (workspace_id, phone) DO NOTHING RETURNING *`,
    entries.map(([, value]) => value)
  );
  return customers.toDocument(rows[0]);
}

const insertCustomer = (db, workspaceId, data) => customers.insert(db, workspaceId, data);
const updateCustomer = (db, workspaceId, id, changes, when) =>
  customers.update(db, workspaceId, id, changes, when);

async function listCustomers(workspaceId, search, db = database) {
  // Whole-word, case-insensitive match on any search word, like the old text index.
  const words = search ? search.match(/[\p{L}\p{N}]+/gu) : null;
  const { rows } = await db.query(
    `SELECT * FROM customers
      WHERE workspace_id = $1
        AND ($2::text IS NULL OR to_tsvector('simple', name) @@ to_tsquery('simple', $2))
      ORDER BY name LIMIT 50`,
    [workspaceId, words ? words.map((word) => word.toLowerCase()).join(" | ") : null]
  );
  return rows.map(customers.toDocument);
}

async function autocompleteCustomers(workspaceId, prefix, db = database) {
  const { rows } = await db.query(
    `SELECT id, name, phone, is_credit_customer, vehicles, gstin, billing_address, state
       FROM customers
      WHERE workspace_id = $1 AND lower(name) LIKE lower($2) || '%' ESCAPE '\\'
      ORDER BY id LIMIT 10`,
    [workspaceId, escapeLike(prefix)]
  );
  return rows.map(defineTable("customers", { jsonb: ["vehicles"], version: false }).toDocument);
}

async function addVehicle(db, workspaceId, customerId, number) {
  const { rowCount } = await db.query(
    `UPDATE customers SET vehicles = vehicles || jsonb_build_array(jsonb_build_object('number', $3::text)),
            updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND NOT vehicles @> jsonb_build_array(jsonb_build_object('number', $3::text))`,
    [workspaceId, customerId, number]
  );
  return rowCount > 0;
}

async function claimReminder(db, workspaceId, customerId, now) {
  const { rows } = await db.query(
    `UPDATE customers SET last_reminder_at = $3, updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND credit_balance > 0
        AND (last_reminder_at IS NULL OR last_reminder_at <= $4)
      RETURNING *`,
    [workspaceId, customerId, now, new Date(+now - 86400000)]
  );
  return customers.toDocument(rows[0]);
}

async function outstandingCustomers(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT c.*, (
        SELECT l.created_at FROM ledger_entries l
         WHERE l.workspace_id = c.workspace_id AND l.customer_id = c.id AND l.type = 'payment'
         ORDER BY l.created_at DESC, l.id DESC LIMIT 1
      ) AS last_payment_at
       FROM customers c WHERE c.workspace_id = $1 AND c.credit_balance > 0
      ORDER BY c.credit_balance DESC, c.id`,
    [workspaceId]
  );
  return rows.map((row) => ({
    ...customers.toDocument(row),
    lastPaymentAt: row.last_payment_at ?? null,
  }));
}

// ------------------------------------------------------------------- ledger

async function insertLedgerEntry(db, workspaceId, data) {
  return ledger.insert(db, workspaceId, data);
}

async function getLedgerEntryFor(db, workspaceId, transactionId, type) {
  const { rows } = await db.query(
    `SELECT * FROM ledger_entries WHERE workspace_id = $1 AND transaction_id = $2 AND type = $3`,
    [workspaceId, transactionId, type]
  );
  return ledger.toDocument(rows[0]);
}

async function listLedger(workspaceId, customerId, { page, limit }, db = database) {
  const [entries, count] = await Promise.all([
    db.query(
      `SELECT * FROM ledger_entries WHERE workspace_id = $1 AND customer_id = $2
        ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [workspaceId, customerId, limit, (page - 1) * limit]
    ),
    db.query(
      `SELECT count(*)::int AS total FROM ledger_entries WHERE workspace_id = $1 AND customer_id = $2`,
      [workspaceId, customerId]
    ),
  ]);
  return { entries: entries.rows.map(ledger.toDocument), total: count.rows[0].total };
}

async function ledgerForAging(workspaceId, customerIds, db = database) {
  if (!customerIds.length) return [];
  const { rows } = await db.query(
    `SELECT customer_id, type, direction, amount, transaction_id, created_at, affects_balance
       FROM ledger_entries WHERE workspace_id = $1 AND customer_id = ANY($2::uuid[])
      ORDER BY customer_id, created_at, id`,
    [workspaceId, customerIds]
  );
  return rows.map((row) => ({
    customerId: row.customer_id,
    type: row.type,
    direction: row.direction,
    amount: row.amount,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
    affectsBalance: row.affects_balance,
  }));
}

// ------------------------------------------------------------ transactions

const insertTransaction = (db, workspaceId, data) => transactions.insert(db, workspaceId, data);
const updateTransaction = (db, workspaceId, id, changes, when) =>
  transactions.update(db, workspaceId, id, changes, when);
const getTransaction = (db, workspaceId, id, options) =>
  transactions.get(db, workspaceId, id, options);

// `scope` is the attendant visibility rule: { createdBy, from, to } or empty.
function scopeClause(scope, values) {
  const clauses = [];
  if (scope?.createdBy) {
    if (!isId(scope.createdBy)) return "false";
    values.push(scope.createdBy);
    clauses.push(`created_by = $${values.length}`);
  }
  if (scope?.from) {
    values.push(scope.from, scope.to);
    clauses.push(`created_at >= $${values.length - 1} AND created_at < $${values.length}`);
  }
  return clauses.join(" AND ") || "true";
}

async function getScopedTransaction(workspaceId, id, scope, db = database) {
  if (!isId(id)) return undefined;
  const values = [workspaceId, id];
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE workspace_id = $1 AND id = $2 AND ${scopeClause(scope, values)}`,
    values
  );
  return transactions.toDocument(rows[0]);
}

async function listTransactions(workspaceId, filters, { page, limit }, db = database) {
  const values = [workspaceId];
  const clauses = ["workspace_id = $1", scopeClause(filters.scope, values)];
  if (filters.paymentMode) {
    values.push(filters.paymentMode);
    clauses.push(`payment_mode = $${values.length}`);
  }
  if (filters.customerSearch) {
    values.push("%" + escapeLike(filters.customerSearch) + "%");
    clauses.push(`customer_name ILIKE $${values.length} ESCAPE '\\'`);
  }
  if (filters.itemTypes) {
    values.push(filters.itemTypes);
    clauses.push(`item_type = ANY($${values.length}::text[])`);
  }
  if (filters.today) {
    values.push(filters.today.start, filters.today.end);
    clauses.push(
      `status = 'active' AND created_at >= $${values.length - 1} AND created_at < $${values.length}`
    );
  }
  const where = clauses.join(" AND ");
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC, id DESC
        LIMIT ${Number(limit)} OFFSET ${(page - 1) * limit}`,
      values
    ),
    db.query(`SELECT count(*)::int AS total FROM transactions WHERE ${where}`, values),
  ]);
  return { transactions: rows.rows.map(transactions.toDocument), total: count.rows[0].total };
}

// Flips an active sale to voided; returns undefined when it was not active.
async function markVoided(db, workspaceId, id, { reason, by, at = new Date(), creditNoteId }) {
  return transactions.update(
    db,
    workspaceId,
    id,
    { status: "voided", voidedReason: reason, voidedAt: at, voidedBy: by, creditNoteId },
    { status: "active" }
  );
}

async function transactionExists(db, workspaceId, id) {
  return Boolean(await transactions.get(db, workspaceId, id));
}

async function shiftSales(db, workspaceId, shiftId) {
  const { rows } = await db.query(
    `SELECT item_type, quantity, payment_mode, amount, tank_changes FROM transactions
      WHERE workspace_id = $1 AND shift_id = $2 AND status = 'active'`,
    [workspaceId, shiftId]
  );
  return rows.map((row) => ({
    itemType: row.item_type,
    quantity: row.quantity,
    paymentMode: row.payment_mode,
    amount: row.amount,
    tankChanges: row.tank_changes ?? [],
  }));
}

async function monthlySaleCount(db, workspaceId, { from, to }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total FROM transactions
      WHERE workspace_id = $1 AND status <> 'voided' AND created_at >= $2 AND created_at < $3`,
    [workspaceId, from, to]
  );
  return rows[0].total;
}

async function hasActiveSalesFor(db, workspaceId, inventoryId) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM transactions WHERE workspace_id = $1 AND inventory_id = $2 AND status = 'active' LIMIT 1`,
    [workspaceId, inventoryId]
  );
  return rowCount > 0;
}

async function dailyItemTotals(workspaceId, start, end, userId, db = database) {
  const values = [workspaceId, start, end];
  let actor = "";
  if (userId) {
    values.push(userId);
    actor = ` AND created_by = $${values.length}`;
  }
  const { rows } = await db.query(
    `SELECT item_type AS _id, (array_agg(unit ORDER BY created_at, id))[1] AS unit,
            sum(quantity) AS "totalQuantity", round(sum(amount), 2) AS "totalAmount", count(*)::int AS count
       FROM transactions
      WHERE workspace_id = $1 AND status = 'active' AND created_at >= $2 AND created_at < $3${actor}
      GROUP BY item_type`,
    values
  );
  return rows;
}

async function salesReport(workspaceId, { start, end, groupBy }, db = database) {
  const key = {
    day: `to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
    item: "item_type",
    paymentMode: "payment_mode",
  }[groupBy];
  const { rows } = await db.query(
    `SELECT ${key} AS "group", sum(quantity) AS quantity, round(sum(amount), 2) AS amount,
            count(*)::int AS count
       FROM transactions
      WHERE workspace_id = $1 AND status = 'active' AND created_at >= $2 AND created_at < $3
      GROUP BY 1 ORDER BY 1`,
    [workspaceId, start, end]
  );
  const { rows: totals } = await db.query(
    `SELECT sum(quantity) AS quantity, round(sum(amount), 2) AS amount, count(*)::int AS count
       FROM transactions
      WHERE workspace_id = $1 AND status = 'active' AND created_at >= $2 AND created_at < $3
     HAVING count(*) > 0`,
    [workspaceId, start, end]
  );
  return { groups: rows, totals };
}

// ---------------------------------------------------- invoices, credit notes

async function listInvoices(workspaceId, { page, limit }, db = database) {
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT id, invoice_number, created_at, customer_name, amount, status,
              invoice -> 'type' AS invoice_type, credit_note_id
         FROM transactions WHERE workspace_id = $1 AND invoice_number IS NOT NULL
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [workspaceId, limit, (page - 1) * limit]
    ),
    db.query(
      `SELECT count(*)::int AS total FROM transactions WHERE workspace_id = $1 AND invoice_number IS NOT NULL`,
      [workspaceId]
    ),
  ]);
  const shaper = defineTable("transactions", { version: true });
  return {
    invoices: rows.rows.map(({ invoice_type, ...row }) => ({
      ...shaper.toDocument(row),
      ...(invoice_type && { invoice: { type: invoice_type } }),
    })),
    total: count.rows[0].total,
  };
}

async function getInvoice(db, workspaceId, id, { lock = false } = {}) {
  if (!isId(id)) return undefined;
  const { rows } = await db.query(
    `SELECT * FROM transactions WHERE workspace_id = $1 AND id = $2 AND invoice_number IS NOT NULL
     ${lock ? "FOR UPDATE" : ""}`,
    [workspaceId, id]
  );
  return transactions.toDocument(rows[0]);
}

async function getCreditNoteFor(db, workspaceId, transactionId) {
  const { rows } = await db.query(
    `SELECT * FROM credit_notes WHERE workspace_id = $1 AND transaction_id = $2`,
    [workspaceId, transactionId]
  );
  return creditNotes.toDocument(rows[0]) ?? null;
}

const insertCreditNote = (db, workspaceId, data) => creditNotes.insert(db, workspaceId, data);

async function nextSequence(db, workspaceId, year, kind) {
  const { rows } = await db.query(
    `INSERT INTO invoice_counters (workspace_id, year, kind, sequence) VALUES ($1, $2, $3, 1)
     ON CONFLICT (workspace_id, year, kind)
     DO UPDATE SET sequence = invoice_counters.sequence + 1, updated_at = now()
     RETURNING sequence`,
    [workspaceId, year, kind]
  );
  return Number(rows[0].sequence);
}

async function taxInvoicesInWindow(workspaceId, { from, to }, db = database) {
  const [notes, invoices] = await Promise.all([
    db.query(`SELECT * FROM credit_notes WHERE workspace_id = $1 AND issued_at >= $2 AND issued_at < $3`, [
      workspaceId,
      from,
      to,
    ]),
    db.query(
      `SELECT invoice FROM transactions
        WHERE workspace_id = $1 AND invoice ->> 'type' = 'tax_invoice'
          AND (invoice ->> 'issuedAt')::timestamptz >= $2 AND (invoice ->> 'issuedAt')::timestamptz < $3
          AND (status = 'active' OR credit_note_id IS NOT NULL)`,
      [workspaceId, from, to]
    ),
  ]);
  const ids = notes.rows.map((note) => note.transaction_id);
  const credited = ids.length
    ? await db.query(
        `SELECT id, invoice FROM transactions
          WHERE workspace_id = $1 AND invoice ->> 'type' = 'tax_invoice' AND id = ANY($2::uuid[])`,
        [workspaceId, ids]
      )
    : { rows: [] };
  return {
    notes: notes.rows.map(creditNotes.toDocument),
    invoices: invoices.rows,
    credited: new Map(credited.rows.map((row) => [row.id, row.invoice])),
  };
}

async function timberSaleLines(workspaceId, { from, to }, db = database) {
  const { rows } = await db.query(
    `SELECT line_items, invoice #> '{tax,rows}' AS tax_rows FROM transactions
      WHERE workspace_id = $1 AND status = 'active' AND jsonb_array_length(coalesce(line_items, '[]')) > 0
        AND created_at >= $2 AND created_at < $3`,
    [workspaceId, from, to]
  );
  return rows.flatMap((row) =>
    row.tax_rows ? row.tax_rows.filter((line) => line.kind === "item") : row.line_items
  );
}

// ---------------------------------------------------------------- inventory

const inventoryTypeWhere = "removed_at IS NULL";

async function listInventory(workspaceId, { timberOnly = false } = {}, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM inventory WHERE workspace_id = $1 AND ${inventoryTypeWhere}
       ${timberOnly ? "AND pricing_unit IS NOT NULL" : ""} ORDER BY item_type`,
    [workspaceId]
  );
  return rows.map(inventory.toDocument);
}

async function listPrices(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT item_type, unit, price_per_unit FROM inventory
      WHERE workspace_id = $1 AND ${inventoryTypeWhere} ORDER BY item_type`,
    [workspaceId]
  );
  return rows.map((row) => ({
    itemType: row.item_type,
    unit: row.unit,
    pricePerUnit: row.price_per_unit,
  }));
}

async function getInventoryItem(db, workspaceId, itemType, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM inventory WHERE workspace_id = $1 AND item_type = $2 AND ${inventoryTypeWhere}
     ${lock ? "FOR UPDATE" : ""}`,
    [workspaceId, itemType]
  );
  return inventory.toDocument(rows[0]);
}

async function getInventoryItems(db, workspaceId, itemTypes) {
  const { rows } = await db.query(
    `SELECT * FROM inventory WHERE workspace_id = $1 AND ${inventoryTypeWhere}
        AND item_type = ANY($2::text[])`,
    [workspaceId, itemTypes]
  );
  return rows.map(inventory.toDocument);
}

const insertInventory = (db, workspaceId, data) => inventory.insert(db, workspaceId, data);
const updateInventory = (db, workspaceId, id, changes, when) =>
  inventory.update(db, workspaceId, id, changes, when);

async function upsertTimberItem(db, workspaceId, itemType, fields) {
  const existing = await getInventoryItem(db, workspaceId, itemType, { lock: true });
  if (existing) return inventory.update(db, workspaceId, existing._id, fields);
  return inventory.insert(db, workspaceId, { itemType, currentStock: 0, ...fields });
}

async function removeInventory(db, workspaceId, id) {
  const { rows } = await db.query(
    `UPDATE inventory SET removed_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND removed_at IS NULL RETURNING *`,
    [workspaceId, id]
  );
  return inventory.toDocument(rows[0]);
}

// Applies a stock change with the "enough stock" guard in the same statement.
async function adjustInventory(db, { workspaceId, itemType, id }, { delta, piecesDelta, allowNegative }) {
  const values = [workspaceId, itemType, delta];
  const clauses = [`workspace_id = $1`, `item_type = $2`, inventoryTypeWhere];
  const sets = [`current_stock = current_stock + $3`];
  if (id) {
    values.push(id);
    clauses.push(`id = $${values.length}`);
  }
  if (piecesDelta !== undefined) {
    values.push(piecesDelta);
    sets.push(`current_pieces = coalesce(current_pieces, 0) + $${values.length}`);
    if (piecesDelta < 0 && !allowNegative)
      clauses.push(`coalesce(current_pieces, 0) >= ${"$" + values.length}::numeric * -1`);
  }
  if (delta < 0 && !allowNegative) clauses.push(`current_stock >= $3::numeric * -1`);
  const { rows } = await db.query(
    `UPDATE inventory SET ${sets.join(", ")}, updated_at = now()
      WHERE ${clauses.join(" AND ")} RETURNING *`,
    values
  );
  return inventory.toDocument(rows[0]);
}

async function inventoryExists(db, workspaceId, itemType, id) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM inventory WHERE workspace_id = $1 AND item_type = $2 AND ${inventoryTypeWhere}
        AND ($3::uuid IS NULL OR id = $3)`,
    [workspaceId, itemType, id ?? null]
  );
  return rowCount > 0;
}

const insertMovement = (db, workspaceId, data) => movements.insert(db, workspaceId, data);

async function movementExistsFor(db, workspaceId, itemType) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM stock_movements WHERE workspace_id = $1 AND item_type = $2 LIMIT 1`,
    [workspaceId, itemType]
  );
  return rowCount > 0;
}

async function markMovementReversed(db, workspaceId, id) {
  await db.query(
    `UPDATE stock_movements SET reversed_at = now() WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id]
  );
}

const insertPriceHistory = (db, workspaceId, data) => priceHistory.insert(db, workspaceId, data);

module.exports = {
  customers,
  inventory,
  transactions,
  getCustomer,
  findCustomerByPhone,
  insertCustomerIfAbsent,
  insertCustomer,
  updateCustomer,
  listCustomers,
  autocompleteCustomers,
  addVehicle,
  claimReminder,
  outstandingCustomers,
  insertLedgerEntry,
  getLedgerEntryFor,
  listLedger,
  ledgerForAging,
  insertTransaction,
  updateTransaction,
  getTransaction,
  getScopedTransaction,
  listTransactions,
  markVoided,
  transactionExists,
  shiftSales,
  monthlySaleCount,
  hasActiveSalesFor,
  dailyItemTotals,
  salesReport,
  listInvoices,
  getInvoice,
  getCreditNoteFor,
  insertCreditNote,
  nextSequence,
  taxInvoicesInWindow,
  timberSaleLines,
  listInventory,
  listPrices,
  getInventoryItem,
  getInventoryItems,
  insertInventory,
  updateInventory,
  upsertTimberItem,
  removeInventory,
  adjustInventory,
  inventoryExists,
  insertMovement,
  movementExistsFor,
  markMovementReversed,
  insertPriceHistory,
};
