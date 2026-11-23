const express = require("express");
const { sales } = require("../controllers/reports.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");
const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();
router.get("/sales", requireAuth, attachWorkspace, asyncHandler(sales));

module.exports = router;
