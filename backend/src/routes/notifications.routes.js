const express = require("express");
const controller = require("../controllers/notifications.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.get("/", controller.list);
router.post("/:id/retry", controller.retry);

module.exports = router;
