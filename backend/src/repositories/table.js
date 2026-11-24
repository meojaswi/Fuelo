// Maps between the API's camelCase documents and snake_case rows, so repositories stay small.
const snake = (key) => key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
const camel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isId = (value) => typeof value === "string" && UUID.test(value);

// `columns` (camelCase) limits writes to known fields, like a strict schema: extra request
// fields are ignored instead of reaching SQL.
function defineTable(
  name,
  { jsonb = [], keepNull = [], omit = [], version = true, columns } = {}
) {
  const allowed = columns && new Set(["_id", "workspaceId", ...columns]);
  const jsonColumns = new Set(jsonb.map(snake));

  // Rows become documents: ids as `_id`, NULL columns omitted unless they are kept as null.
  function toDocument(row) {
    if (!row) return row;
    const doc = {};
    for (const [column, value] of Object.entries(row)) {
      const key = column === "id" ? "_id" : camel(column);
      if (omit.includes(key)) continue;
      if (value === null && !keepNull.includes(key)) continue;
      doc[key] = value;
    }
    if (version) doc.__v = 0;
    return doc;
  }

  function toColumns(data) {
    const entries = Object.entries(data).filter(
      ([key, value]) => value !== undefined && (!allowed || allowed.has(key))
    );
    return entries.map(([key, value]) => {
      const column = key === "_id" ? "id" : snake(key);
      return [column, jsonColumns.has(column) && value !== null ? JSON.stringify(value) : value];
    });
  }

  async function insert(db, workspaceId, data) {
    const entries = toColumns({ ...data, workspaceId });
    const { rows } = await db.query(
      `INSERT INTO ${name} (${entries.map(([column]) => column).join(", ")})
       VALUES (${entries.map((_, index) => "$" + (index + 1)).join(", ")}) RETURNING *`,
      entries.map(([, value]) => value)
    );
    return toDocument(rows[0]);
  }

  // Sets the given fields (null clears one). `when` adds equality conditions to the WHERE clause.
  async function update(db, workspaceId, id, changes, when = {}) {
    const entries = toColumns(changes);
    const values = [workspaceId, id];
    const sets = entries.map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    });
    const conditions = ["workspace_id = $1", "id = $2"];
    for (const [column, value] of toColumns(when)) {
      if (value === null) conditions.push(`${column} IS NULL`);
      else {
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      }
    }
    const { rows } = await db.query(
      `UPDATE ${name} SET ${[...sets, "updated_at = now()"].join(", ")}
        WHERE ${conditions.join(" AND ")} RETURNING *`,
      values
    );
    return toDocument(rows[0]);
  }

  async function get(db, workspaceId, id, { lock = false, where = "" } = {}) {
    if (!isId(id)) return undefined;
    const { rows } = await db.query(
      `SELECT * FROM ${name} WHERE workspace_id = $1 AND id = $2 ${where} ${lock ? "FOR UPDATE" : ""}`,
      [workspaceId, id]
    );
    return toDocument(rows[0]);
  }

  async function purge(db, workspaceId, id) {
    const { rows } = await db.query(
      `DELETE FROM ${name} WHERE workspace_id = $1 AND id = $2 RETURNING *`,
      [workspaceId, id]
    );
    return toDocument(rows[0]);
  }

  return { name, toDocument, toColumns, insert, update, get, purge };
}

module.exports = { defineTable, isId, snake, camel };
