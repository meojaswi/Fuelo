const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const { query, withTransaction } = require("../src/config/postgres");
const { withWorkspace } = require("../src/repositories/workspaceScope");
const { nextInvoiceSequence } = require("../src/repositories/invoiceCounters");
const { claimPendingMessage } = require("../src/repositories/messageJobs");
const { acquireDailyLock } = require("../src/repositories/schedulerLocks");
const { isolatedPostgres } = require("./helpers/postgres");
const identity = require("../src/repositories/identity");
const refreshTokens = require("../src/repositories/refreshTokens");
const auditLog = require("../src/repositories/auditLog");

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

  test("workspace settings preserve unrelated JSON and audit queries stay tenant scoped", async () => {
    const { account, workspace } = await withTransaction(async (db) => {
      const account = await identity.createAccount({ phone: "9000000097", name: "Operator" }, db);
      const { workspace } = await identity.createOwnedWorkspace(
        account._id,
        { businessName: "Station", verticalType: "fuel", config: { itemTypes: ["Diesel"] } },
        db
      );
      return { account, workspace };
    });
    const saved = await identity.updateWorkspaceSettings(workspace.workspaceId, {
      businessName: "New Station",
      language: "en",
      config: { attendantsCanDip: true, pumpVariancePercent: 0.8 },
    });
    assert.equal(saved.businessName, "New Station");
    assert.equal(saved.language, "en");
    assert.deepEqual(saved.config, {
      itemTypes: ["Diesel"],
      attendantsCanDip: true,
      pumpVariancePercent: 0.8,
    });

    const otherWorkspaceId = await newWorkspace();
    const actorUserId = account._id;
    await auditLog.record(otherWorkspaceId, { action: "settings.update", actorUserId });
    await auditLog.record(workspace.workspaceId, { action: "settings.update", actorUserId });
    const filter = { action: "settings.update", actor: actorUserId, page: 1, limit: 10 };
    const { events, total } = await auditLog.list(workspace.workspaceId, filter);
    assert.equal(total, 1);
    assert.equal(events[0].actorName, "Operator");
    assert.equal(events[0].workspaceId, workspace.workspaceId);
  });

  test("identity storage orders active workspaces and keeps password hashes private", async () => {
    const { account, older } = await withTransaction(async (db) => {
      const account = await identity.createAccount(
        { phone: "9000000001", name: "Owner", passwordHash: "fixture-hash" },
        db
      );
      const older = await identity.createOwnedWorkspace(
        account._id,
        { businessName: "Older", verticalType: "fuel", config: {} },
        db
      );
      return { account, older };
    });
    const newer = await withTransaction(async (db) => {
      assert.equal((await identity.lockAccount(account._id, db))._id, account._id);
      return identity.createOwnedWorkspace(
        account._id,
        { businessName: "Newer", verticalType: "timber", config: {} },
        db
      );
    });

    const names = async () =>
      (await identity.listActiveWorkspacesForAccount(account._id)).map(
        ({ workspace }) => workspace.businessName
      );
    assert.equal(account.passwordHash, undefined);
    assert.equal((await identity.getAccount(account._id)).passwordHash, undefined);
    assert.equal((await identity.getActiveCredentials(account.phone)).passwordHash, "fixture-hash");
    assert.equal((await identity.getWorkspace(older.workspace.workspaceId)).businessName, "Older");
    assert.deepEqual(await names(), ["Older", "Newer"]);
    await identity.markWorkspaceUsed(newer.workspace.workspaceId, newer.membership._id);
    assert.deepEqual(await names(), ["Newer", "Older"]);
    const membership = await identity.getActiveMembership(older.workspace.workspaceId, account._id);
    assert.equal(membership.role, "owner");
    await withTransaction(async (db) => {
      const updated = await identity.updateCredentials(account._id, "updated-fixture", 0, db);
      assert.equal(updated.tokenVersion, 1);
      assert.equal(updated.passwordHash, undefined);
      assert.equal(await identity.updateCredentials(account._id, "old-version", 0, db), undefined);
    });
  });

  test("expired refresh tokens cannot be found or claimed and only one rotation wins", async () => {
    const { account, workspaceId } = await withTransaction(async (db) => {
      const account = await identity.createAccount({ phone: "9000000098" }, db);
      const { workspace } = await identity.createOwnedWorkspace(
        account._id,
        { businessName: "Sessions", verticalType: "fuel", config: {} },
        db
      );
      return { account, workspaceId: workspace.workspaceId };
    });
    const familyId = randomUUID();
    const issue = (tokenHash, expiresAt) =>
      refreshTokens.insert(workspaceId, {
        userId: account._id,
        tokenVersion: account.tokenVersion,
        familyId,
        tokenHash,
        expiresAt,
      });
    const expired = await issue("expired-fixture", new Date(0));
    assert.equal(await refreshTokens.findUnexpiredByHash("expired-fixture"), undefined);
    assert.equal(
      await withTransaction((db) => refreshTokens.claimForRotation(workspaceId, expired._id, db)),
      undefined
    );

    const future = new Date(Date.now() + 60_000);
    const current = await issue("current-fixture", future);
    const rotate = () =>
      withTransaction((db) => refreshTokens.claimForRotation(workspaceId, current._id, db));
    assert.equal((await Promise.all([rotate(), rotate()])).filter(Boolean).length, 1);
    const replacement = await issue("replacement-fixture", future);
    assert.equal(
      (
        await withTransaction((db) =>
          refreshTokens.setReplacement(workspaceId, current._id, replacement._id, db)
        )
      ).rowCount,
      1
    );
    await refreshTokens.revokeFamily(account._id, familyId);
    assert.ok((await refreshTokens.findUnexpiredByHash("replacement-fixture")).revokedAt);
    const next = await issue("switch-fixture", future);
    const { workspace: target } = await withTransaction((db) =>
      identity.createOwnedWorkspace(
        account._id,
        { businessName: "Next workspace", verticalType: "fuel", config: {} },
        db
      )
    );
    assert.equal(
      (await refreshTokens.switchWorkspace(target.workspaceId, "switch-fixture", account._id, 0))
        .rowCount,
      1
    );
    assert.equal(
      (await refreshTokens.findUnexpiredByHash("switch-fixture")).workspaceId,
      target.workspaceId
    );
    await withTransaction((db) => refreshTokens.revokeAllForAccount(account._id, db));
    assert.equal(
      await withTransaction((db) =>
        refreshTokens.claimForRotation(target.workspaceId, next._id, db)
      ),
      undefined
    );
  });

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
