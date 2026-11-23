const { randomUUID } = require("node:crypto");
const { after, before } = require("node:test");
const { Client } = require("pg");
const { connectionOptions, getPool } = require("../../src/config/postgres");
const { migrate } = require("../../src/config/migrations");

function isolatedPostgres() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is required");
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const connection = connectionOptions({ DATABASE_URL: testUrl, PGSSL: process.env.PGSSL });
  const url = new URL(testUrl);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.href;
  before(() => migrate({ connection, schema }));
  after(async () => {
    await getPool().end();
    const client = new Client(connection);
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  });
}

module.exports = { isolatedPostgres };
