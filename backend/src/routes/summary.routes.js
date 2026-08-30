const express = require("express");
const controller = require("../controllers/summary.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);
router.get("/", controller.getByDate);

module.exports = router;
