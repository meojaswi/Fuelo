const identity = require("../repositories/identity");
const { query } = require("../config/postgres");
const { fail } = require("./atomic.service");

// Locks the workspace row inside the caller's PostgreSQL transaction so count-based limits and
// owner rules serialize across API instances. TEMP(pg-cutover): callers that still run inside a
// MongoDB `atomic` context have no PostgreSQL client, so they only check the workspace exists.
async function lockWorkspace(workspaceId, context = {}) {
  const db = context.db ?? { query };
  const workspace = context.db
    ? await identity.lockWorkspace(workspaceId, db)
    : await identity.getWorkspace(workspaceId);
  if (!workspace) fail(404, "Workspace not found");
  return workspace;
}

module.exports = { lockWorkspace };
