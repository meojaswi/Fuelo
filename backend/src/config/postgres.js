const { Pool } = require("pg");

function connectionOptions({ DATABASE_URL: connectionString, PGSSL } = process.env) {
  if (!connectionString) throw new Error("Missing required env var: DATABASE_URL");
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (PGSSL !== undefined && !["true", "false"].includes(PGSSL)) {
    throw new Error("PGSSL must be true or false");
  }
  if (PGSSL !== undefined) {
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
      if (url.searchParams.has(key)) {
        throw new Error("Use either PGSSL or SSL options in DATABASE_URL");
      }
    }
    return { connectionString, ssl: PGSSL === "true" };
  }
  return { connectionString };
}

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool(connectionOptions());
    pool.on("error", (error) =>
      process.emitWarning("Idle PostgreSQL client error", { code: error.code })
    );
  }
  return pool;
}

function query(sql, params) {
  return getPool().query(sql, params);
}

async function withTransaction(work) {
  for (let attempt = 1; ; attempt++) {
    const client = await getPool().connect();
    let rollbackError;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (failure) {
        rollbackError = failure;
      }
      if (rollbackError || attempt === 3 || !["40001", "40P01"].includes(error.code)) {
        throw error;
      }
    } finally {
      client.release(rollbackError);
    }
  }
}

module.exports = { connectionOptions, getPool, query, withTransaction };
