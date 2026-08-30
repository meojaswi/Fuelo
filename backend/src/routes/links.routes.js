const express = require("express");
const controller = require("../controllers/links.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.post("/", requireAuth, attachWorkspace, controller.create);
router.get("/:token", controller.resolve); // public, one-time

module.exports = router;
