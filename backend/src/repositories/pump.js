const { query } = require("../config/postgres");
const { defineTable, isId } = require("./table");

const database = { query };

const tanks = defineTable("tanks");
const nozzles = defineTable("nozzles");
const shifts = defineTable("shifts", {
  jsonb: ["pricesSnapshot", "nozzleReadings", "stockEffects"],
});
const deliveries = defineTable("deliveries");
const dips = defineTable("dip_readings");
const movementRows = defineTable("stock_movements", { jsonb: ["tankChanges"], omit: ["updatedAt"] });

// -------------------------------------------------------------------- tanks

async function listTanks(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM tanks WHERE workspace_id = $1 ORDER BY is_active DESC, name`,
    [workspaceId]
  );
  return rows.map(tanks.toDocument);
}

async function tankTargets(workspaceId, db = database) {
  const { rows } = await db.query(
    `SELECT id, name, item_type, capacity_litres FROM tanks
      WHERE workspace_id = $1 AND is_active ORDER BY name`,
    [workspaceId]
  );
  return rows.map(defineTable("tanks", { version: false }).toDocument);
}

const getTank = (db, workspaceId, id, options) => tanks.get(db, workspaceId, id, options);

async function getActiveTank(db, workspaceId, id, { lock = false } = {}) {
  return tanks.get(db, workspaceId, id, { lock, where: "AND is_active" });
}

// Locked in a stable order so concurrent stock changes cannot deadlock.
async function activeTanksForItem(db, workspaceId, itemType) {
  const { rows } = await db.query(
    `SELECT * FROM tanks WHERE workspace_id = $1 AND item_type = $2 AND is_active
      ORDER BY created_at, id FOR UPDATE`,
    [workspaceId, itemType]
  );
  return rows.map(tanks.toDocument);
}

async function hasTanks(db, workspaceId, itemType, { activeOnly = false } = {}) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM tanks WHERE workspace_id = $1 AND item_type = $2 ${activeOnly ? "AND is_active" : ""} LIMIT 1`,
    [workspaceId, itemType]
  );
  return rowCount > 0;
}

const insertTank = (db, workspaceId, data) => tanks.insert(db, workspaceId, data);
const updateTank = (db, workspaceId, id, changes, when) =>
  tanks.update(db, workspaceId, id, changes, when);

async function tanksCreatedBefore(workspaceId, before, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM tanks WHERE workspace_id = $1 AND created_at < $2 ORDER BY item_type, name`,
    [workspaceId, before]
  );
  return rows.map(tanks.toDocument);
}

async function tankIsBusy(db, workspaceId, tankId) {
  const [shift, nozzle, sale, delivery] = await Promise.all([
    db.query(
      `SELECT 1 FROM shifts WHERE workspace_id = $1 AND nozzle_readings @> $2::jsonb
          AND (status = 'open' OR closed_at >= $3) LIMIT 1`,
      [workspaceId, JSON.stringify([{ tankId }]), new Date(Date.now() - 86400000)]
    ),
    db.query(
      `SELECT 1 FROM nozzles WHERE workspace_id = $1 AND tank_id = $2 AND is_active LIMIT 1`,
      [workspaceId, tankId]
    ),
    db.query(
      `SELECT 1 FROM transactions WHERE workspace_id = $1 AND status = 'active'
          AND tank_changes @> $2::jsonb LIMIT 1`,
      [workspaceId, JSON.stringify([{ tankId }])]
    ),
    db.query(
      `SELECT 1 FROM deliveries WHERE workspace_id = $1 AND status = 'active' AND tank_id = $2 LIMIT 1`,
      [workspaceId, tankId]
    ),
  ]);
  return [shift, nozzle, sale, delivery].some((result) => result.rowCount > 0);
}

// ------------------------------------------------------------------ nozzles

async function listActiveNozzles(workspaceId, db = database, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM nozzles WHERE workspace_id = $1 AND is_active ORDER BY label, id ${lock ? "FOR UPDATE" : ""}`,
    [workspaceId]
  );
  return rows.map(nozzles.toDocument);
}

const insertNozzle = (db, workspaceId, data) => nozzles.insert(db, workspaceId, data);

async function updateActiveNozzle(db, workspaceId, id, changes) {
  if (!isId(id)) return undefined;
  return nozzles.update(db, workspaceId, id, changes, { isActive: true });
}

async function setMeter(db, workspaceId, nozzleId, meter) {
  const { rows } = await db.query(
    `UPDATE nozzles n SET last_meter_reading = $3, updated_at = now()
       FROM (SELECT id, last_meter_reading FROM nozzles WHERE workspace_id = $1 AND id = $2 FOR UPDATE) old
      WHERE n.id = old.id RETURNING old.last_meter_reading AS previous`,
    [workspaceId, nozzleId, meter]
  );
  return rows[0];
}

// ------------------------------------------------------------------- shifts

async function listShifts(workspaceId, { status, openedBy }, { page, limit }, db = database) {
  const values = [workspaceId];
  const clauses = ["workspace_id = $1"];
  if (status) {
    values.push(status);
    clauses.push(`status = $${values.length}`);
  }
  if (openedBy) {
    if (!isId(openedBy)) return { shifts: [], total: 0 };
    values.push(openedBy);
    clauses.push(`opened_by = $${values.length}`);
  }
  const where = clauses.join(" AND ");
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM shifts WHERE ${where} ORDER BY opened_at DESC, id DESC
        LIMIT ${Number(limit)} OFFSET ${(page - 1) * limit}`,
      values
    ),
    db.query(`SELECT count(*)::int AS total FROM shifts WHERE ${where}`, values),
  ]);
  return { shifts: rows.rows.map(shifts.toDocument), total: count.rows[0].total };
}

async function getShift(db, workspaceId, id, { openedBy, status, lock = false } = {}) {
  if (!isId(id)) return undefined;
  const values = [workspaceId, id];
  let extra = "";
  if (openedBy) {
    if (!isId(openedBy)) return undefined;
    values.push(openedBy);
    extra += ` AND opened_by = $${values.length}`;
  }
  if (status) {
    values.push(status);
    extra += ` AND status = $${values.length}`;
  }
  const { rows } = await db.query(
    `SELECT * FROM shifts WHERE workspace_id = $1 AND id = $2${extra} ${lock ? "FOR UPDATE" : ""}`,
    values
  );
  return shifts.toDocument(rows[0]);
}

async function getOpenShift(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT * FROM shifts WHERE workspace_id = $1 AND status = 'open'`,
    [workspaceId]
  );
  return shifts.toDocument(rows[0]);
}

async function isShiftClosed(db, workspaceId, id) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM shifts WHERE workspace_id = $1 AND id = $2 AND status = 'closed'`,
    [workspaceId, id]
  );
  return rowCount > 0;
}

const insertShift = (db, workspaceId, data) => shifts.insert(db, workspaceId, data);

async function updateShift(db, workspaceId, id, changes, when) {
  return shifts.update(db, workspaceId, id, changes, when);
}

async function hasNewerShift(db, workspaceId, shift) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM shifts WHERE workspace_id = $1 AND id <> $2
        AND (status = 'open' OR opened_at >= $3) LIMIT 1`,
    [workspaceId, shift._id, shift.openedAt]
  );
  return rowCount > 0;
}

async function closedShiftsBetween(workspaceId, { from, to }, db = database) {
  const { rows } = await db.query(
    `SELECT * FROM shifts WHERE workspace_id = $1 AND status = 'closed'
        AND closed_at >= $2 AND closed_at < $3 ORDER BY closed_at, id`,
    [workspaceId, from, to]
  );
  return rows.map(shifts.toDocument);
}

// --------------------------------------------------------------- deliveries

async function listDeliveries(workspaceId, { from, to }, { page, limit }, db = database) {
  const values = [workspaceId, from ?? null, to ?? null];
  const where = `workspace_id = $1 AND ($2::timestamptz IS NULL OR received_at >= $2)
                 AND ($3::timestamptz IS NULL OR received_at < $3)`;
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT * FROM deliveries WHERE ${where} ORDER BY received_at DESC, id DESC
        LIMIT ${Number(limit)} OFFSET ${(page - 1) * limit}`,
      values
    ),
    db.query(`SELECT count(*)::int AS total FROM deliveries WHERE ${where}`, values),
  ]);
  return { deliveries: rows.rows.map(deliveries.toDocument), total: count.rows[0].total };
}

const insertDelivery = (db, workspaceId, data) => deliveries.insert(db, workspaceId, data);
const getDelivery = (db, workspaceId, id, options) => deliveries.get(db, workspaceId, id, options);
const updateDelivery = (db, workspaceId, id, changes, when) =>
  deliveries.update(db, workspaceId, id, changes, when);

// --------------------------------------------------------------------- dips

async function listDips(workspaceId, tankId, { recordedBy, from, to }, db = database) {
  const values = [workspaceId, tankId];
  let extra = "";
  if (recordedBy) {
    if (!isId(recordedBy)) return [];
    values.push(recordedBy, from, to);
    extra = ` AND recorded_by = $3 AND recorded_at >= $4 AND recorded_at < $5`;
  }
  const { rows } = await db.query(
    `SELECT * FROM dip_readings WHERE workspace_id = $1 AND tank_id = $2${extra}
      ORDER BY recorded_at DESC, id DESC LIMIT 50`,
    values
  );
  return rows.map(dips.toDocument);
}

const insertDip = (db, workspaceId, data) => dips.insert(db, workspaceId, data);

// -------------------------------------------------------------- pump report

async function openingTankStock(workspaceId, before, db = database) {
  const { rows } = await db.query(
    `SELECT change ->> 'tankId' AS tank_id, sum((change ->> 'delta')::numeric) AS opening
       FROM stock_movements, jsonb_array_elements(tank_changes) AS change
      WHERE workspace_id = $1 AND created_at < $2 AND jsonb_array_length(tank_changes) > 0
      GROUP BY 1`,
    [workspaceId, before]
  );
  return rows.map((row) => ({ _id: row.tank_id, opening: row.opening }));
}

async function tankMovementsBetween(workspaceId, { from, to }, db = database) {
  const { rows } = await db.query(
    `SELECT reason, tank_changes, delivery_id, transaction_id FROM stock_movements
      WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
        AND jsonb_array_length(tank_changes) > 0`,
    [workspaceId, from, to]
  );
  return rows.map((row) => ({
    reason: row.reason,
    tankChanges: row.tank_changes,
    deliveryId: row.delivery_id,
    transactionId: row.transaction_id,
  }));
}

async function latestDips(workspaceId, { from, to }, db = database) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (tank_id) * FROM dip_readings
      WHERE workspace_id = $1 AND recorded_at >= $2 AND recorded_at < $3
      ORDER BY tank_id, recorded_at DESC, id DESC`,
    [workspaceId, from, to]
  );
  return rows.map((row) => ({ latest: dips.toDocument(row) }));
}

async function voidedIds(workspaceId, table, ids, db = database) {
  if (!ids.length) return new Set();
  const { rows } = await db.query(
    `SELECT id FROM ${table === "deliveries" ? "deliveries" : "transactions"}
      WHERE workspace_id = $1 AND status = 'voided' AND id = ANY($2::uuid[])`,
    [workspaceId, ids]
  );
  return new Set(rows.map(({ id }) => id));
}

module.exports = {
  movementRows,
  listTanks,
  tankTargets,
  getTank,
  getActiveTank,
  activeTanksForItem,
  hasTanks,
  insertTank,
  updateTank,
  tanksCreatedBefore,
  tankIsBusy,
  listActiveNozzles,
  insertNozzle,
  updateActiveNozzle,
  setMeter,
  listShifts,
  getShift,
  getOpenShift,
  isShiftClosed,
  insertShift,
  updateShift,
  hasNewerShift,
  closedShiftsBetween,
  listDeliveries,
  insertDelivery,
  getDelivery,
  updateDelivery,
  listDips,
  insertDip,
  openingTankStock,
  tankMovementsBetween,
  latestDips,
  voidedIds,
};
