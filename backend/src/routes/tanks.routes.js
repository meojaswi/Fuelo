const router = require("express").Router();
const dips = require("../controllers/dips.controller");
const controller = require("../controllers/tanks.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { requirePump } = require("../middleware/pump.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");
const { tank, tankEdit, reason, dip } = require("../validators/pump.schema");

router.use(requireAuth, attachWorkspace);
router.get(
  "/",
  requirePermission("tanks:manage"),
  requirePump("tanks"),
  asyncHandler(controller.list)
);
router.get(
  "/dip-targets",
  requirePermission("tanks:dip"),
  requirePump("tanks"),
  asyncHandler(dips.targets)
);
router.get(
  "/:id/dips",
  requirePermission("tanks:dip"),
  requirePump("tanks"),
  asyncHandler(dips.list)
);
router.post(
  "/:id/dips",
  requirePermission("tanks:dip"),
  validateBody(dip),
  asyncHandler(dips.create)
);
router.get(
  "/:id",
  requirePermission("tanks:manage"),
  requirePump("tanks"),
  asyncHandler(controller.get)
);
router.post(
  "/",
  requirePermission("tanks:manage"),
  validateBody(tank),
  asyncHandler(controller.create)
);
router.patch(
  "/:id",
  requirePermission("tanks:manage"),
  validateBody(tankEdit),
  asyncHandler(controller.update)
);
router.delete(
  "/:id",
  requirePermission("tanks:manage"),
  validateBody(reason),
  asyncHandler(controller.deactivate)
);
module.exports = router;
