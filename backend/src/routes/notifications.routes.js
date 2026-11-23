const express = require("express");
const controller = require("../controllers/notifications.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get("/", asyncHandler(controller.list));
router.post("/:id/retry", asyncHandler(controller.retry));

module.exports = router;
