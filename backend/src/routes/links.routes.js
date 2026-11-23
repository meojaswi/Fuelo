const express = require("express");
const controller = require("../controllers/links.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.post("/", requireAuth, attachWorkspace, asyncHandler(controller.create));
router.get("/:token", asyncHandler(controller.resolve));

module.exports = router;
