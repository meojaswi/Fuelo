const assert = require("node:assert/strict");
const { test } = require("node:test");
const { withWorkspace } = require("../src/repositories/workspaceScope");

test("tenant work rejects a missing workspace before attempting to query", async () => {
  await assert.rejects(
    withWorkspace(undefined, (db) => db.query("SELECT id FROM memberships")),
    { name: "TypeError", message: "A valid workspace id is required" }
  );
});
