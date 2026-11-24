const { withTransaction } = require("../config/postgres");
const { requireWorkspaceId } = require("../repositories/workspaceScope");

// Runs `work` in one PostgreSQL transaction. Callers lock the workspace row first (see
// lockWorkspace) so count-based limits, stock and balances serialize across API instances.
function atomic(workspaceId, work) {
  return withTransaction(async (db) => {
    if (typeof workspaceId === "string" && !workspaceId.startsWith("account:"))
      await db.query("SELECT set_config('app.workspace_id', $1, true)", [
        requireWorkspaceId(workspaceId),
      ]);
    return work({ db });
  });
}

function fail(status, message, publicCode) {
  throw Object.assign(new Error(message), { status, publicCode });
}

module.exports = { atomic, fail };
