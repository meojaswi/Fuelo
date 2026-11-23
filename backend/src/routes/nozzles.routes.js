const router = require("express").Router();
const controller = require("../controllers/nozzles.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { requirePump } = require("../middleware/pump.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");
const { nozzle, nozzleEdit, reason } = require("../validators/pump.schema");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("shifts:operate"),
  requirePump("shifts"),
  asyncHandler(controller.list)
);
router.post(
  "/",
  requirePermission("tanks:manage"),
  validateBody(nozzle),
  asyncHandler(controller.create)
);
router.patch(
  "/:id",
  requirePermission("tanks:manage"),
  validateBody(nozzleEdit),
  asyncHandler(controller.update)
);
router.delete(
  "/:id",
  requirePermission("tanks:manage"),
  validateBody(reason),
  asyncHandler(controller.deactivate)
);
module.exports = router;
