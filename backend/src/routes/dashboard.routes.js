const express = require("express");
const controller = require("../controllers/dashboard.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);
router.get(["/", "/daily-summary"], asyncHandler(controller.getToday));

module.exports = router;
