const identity = require("../repositories/identity");
const { fail } = require("./atomic.service");

// Locks the workspace row inside the caller's transaction, so writers for one workspace take
// turns. That is what keeps plan limits, owner rules, stock and balances consistent.
async function lockWorkspace(workspaceId, { db }) {
  const workspace = await identity.lockWorkspace(workspaceId, db);
  if (!workspace) fail(404, "Workspace not found");
  return workspace;
}

module.exports = { lockWorkspace };
