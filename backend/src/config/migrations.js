const path = require("node:path");
const { connectionOptions } = require("./postgres");

async function migrate({ connection = connectionOptions(), schema = "public" } = {}) {
  const { runner } = await import("node-pg-migrate");
  return runner({
    databaseUrl: connection,
    dir: path.join(__dirname, "../../migrations"),
    direction: "up",
    schema,
    createSchema: true,
    migrationsTable: "pgmigrations",
    advisoryLockMode: "wait",
    verbose: false,
  });
}

module.exports = { migrate };
