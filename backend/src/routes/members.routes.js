const express = require("express");
const controller = require("../controllers/members.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const { validateBody } = require("../middleware/validate.middleware");
const { inviteSchema, memberPatchSchema } = require("../validators/members.schema");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();
router.use(requireAuth, attachWorkspace);
router.get("/", requirePermission("members:read"), asyncHandler(controller.list));
router.post(
  "/invite",
  requirePermission("members:manage"),
  validateBody(inviteSchema),
  asyncHandler(controller.invite)
);
router.patch(
  "/:id",
  requirePermission("members:manage"),
  validateBody(memberPatchSchema),
  asyncHandler(controller.patch)
);
router.delete("/:id", requirePermission("members:manage"), asyncHandler(controller.remove));
module.exports = router;
