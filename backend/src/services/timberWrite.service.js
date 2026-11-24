const { atomic } = require("./atomic.service");
const { lockWorkspace } = require("./workspaceWrite.service");
const { assertCan } = require("./entitlements.service");
const { checkTimber } = require("../middleware/timber.middleware");

function writeTimber(req, feature, work) {
  return atomic(req.workspaceId, async (context) => {
    const workspace = await lockWorkspace(req.workspaceId, context);
    checkTimber(workspace, feature);
    await assertCan(req.workspaceId, "write", { workspace, db: context.db });
    return work(context, workspace);
  });
}

module.exports = { writeTimber };
