const { atomic } = require("./atomic.service");
const { assertCan } = require("./entitlements.service");
const { lockWorkspace } = require("./workspaceWrite.service");
const { checkPump } = require("../middleware/pump.middleware");

function writePump(req, feature, work) {
  const { workspaceId } = req;
  return atomic(workspaceId, async (context) => {
    const workspace = await lockWorkspace(workspaceId, context);
    checkPump(workspace, feature);
    await assertCan(workspaceId, "write", { workspace, session: context.session });
    return work(context, workspace);
  });
}

module.exports = { writePump };
