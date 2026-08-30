const express = require("express");
const controller = require("../controllers/dashboard.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);
router.get("/", controller.getToday);

module.exports = router;
