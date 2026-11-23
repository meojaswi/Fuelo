const Workspace = require("../models/workspace.model");
const { fail } = require("./atomic.service");

// Touch one workspace document inside the transaction to serialize count-based
// limits and owner invariants across API instances on a MongoDB replica set.
async function lockWorkspace(workspaceId, { session }) {
  const workspace = await Workspace.findOneAndUpdate(
    { workspaceId, isActive: true },
    { $inc: { writeVersion: 1 } },
    { new: true, session, timestamps: false }
  );
  if (!workspace) fail(404, "Workspace not found");
  return workspace;
}

module.exports = { lockWorkspace };
