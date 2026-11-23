const assert = require("node:assert/strict");
const { test } = require("node:test");
const { query, withTransaction } = require("../src/config/postgres");
const { withWorkspace } = require("../src/repositories/workspaceScope");
const { nextInvoiceSequence } = require("../src/repositories/invoiceCounters");
const { claimPendingMessage } = require("../src/repositories/messageJobs");
const { acquireDailyLock } = require("../src/repositories/schedulerLocks");
const { isolatedPostgres } = require("./helpers/postgres");

if (!process.env.DATABASE_URL_TEST) {
  test("PostgreSQL schema integration", { skip: "Set DATABASE_URL_TEST" }, () => {});
} else {
  isolatedPostgres();

  async function newWorkspace() {
    const { rows } = await query(
      "INSERT INTO workspaces (business_name, vertical_type, plan_limits) VALUES ('Test', 'fuel', '{}') RETURNING id"
    );
    return rows[0].id;
  }

  test("a child row cannot reference a parent in another workspace", async () => {
    const [workspaceId, otherWorkspaceId] = await Promise.all([newWorkspace(), newWorkspace()]);
    const { rows } = await query(
      `INSERT INTO tanks (workspace_id, name, item_type, capacity_litres)
       VALUES ($1, 'Tank', 'Diesel', 100) RETURNING id`,
      [otherWorkspaceId]
    );
    await assert.rejects(
      withWorkspace(workspaceId, (db, scopedId) =>
        db.query(
          `INSERT INTO nozzles (workspace_id, tank_id, label, item_type)
           VALUES ($1, $2, 'A', 'Diesel')`,
          [scopedId, rows[0].id]
        )
      ),
      { code: "23503" }
    );
  });

  test("a rolled-back transaction does not consume an invoice number", async () => {
    const workspaceId = await newWorkspace();
    const allocate = (db) => nextInvoiceSequence(db, workspaceId, "2026-27", "invoice");
    const abort = new Error("Abort after allocating");
    await assert.rejects(
      withWorkspace(workspaceId, async (db) => {
        assert.equal(await allocate(db), 1);
        throw abort;
      }),
      abort
    );
    assert.equal(await withWorkspace(workspaceId, allocate), 1);
  });

  test("transaction retries roll back earlier writes before rerunning the callback", async () => {
    const workspaceId = await newWorkspace();
    let calls = 0;
    const sequence = await withWorkspace(workspaceId, async (db, scopedId) => {
      calls++;
      const next = await nextInvoiceSequence(db, scopedId, "2026-27", "invoice");
      if (calls === 1) {
        await db.query("DO $$ BEGIN RAISE serialization_failure; END $$");
      }
      return next;
    });
    assert.equal(calls, 2);
    assert.equal(sequence, 1);
  });

  test("a concurrent worker skips a locked message", async () => {
    const workspaceId = await newWorkspace();
    const { rows } = await query(
      `INSERT INTO message_jobs (workspace_id, channel, to_phone, body)
       VALUES ($1, 'whatsapp', '9000000099', 'Test') RETURNING id`,
      [workspaceId]
    );

    await withTransaction(async (db) => {
      const first = await claimPendingMessage(db);
      assert.equal(first.id, rows[0].id);
      assert.equal(await withTransaction(claimPendingMessage), undefined);
      await db.query("UPDATE message_jobs SET status = 'sent' WHERE id = $1", [first.id]);
    });
  });

  test("only one scheduler gets each named daily lock", async () => {
    const results = await Promise.all([
      acquireDailyLock("eod-summary", "2026-11-24"),
      acquireDailyLock("eod-summary", "2026-11-24"),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await acquireDailyLock("eod-summary", "2026-11-25"), true);
  });

  test("the sales schema stores the large amount and quantity without rounding", async () => {
    const workspaceId = await newWorkspace();
    const { rows } = await query(
      `INSERT INTO transactions
         (workspace_id, customer_name, customer_phone, item_type, quantity, unit, amount, payment_mode)
       VALUES ($1, 'Test', '9000000099', 'Diesel', $2, 'litres', $3, 'cash')
       RETURNING quantity, amount`,
      [workspaceId, "1.2345", "1000000000000"]
    );
    assert.deepEqual(rows[0], { quantity: "1.2345", amount: "1000000000000.00" });
  });
}
