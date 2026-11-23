const { withTransaction } = require("../config/postgres");

function requireWorkspaceId(workspaceId) {
  if (
    typeof workspaceId !== "string" ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(workspaceId)
  ) {
    throw new TypeError("A valid workspace id is required");
  }
  return workspaceId;
}

async function withWorkspace(workspaceId, work) {
  const id = requireWorkspaceId(workspaceId);
  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [id]);
    return work(client, id);
  });
}

module.exports = { requireWorkspaceId, withWorkspace };
