const express = require("express");
const dealerController = require("../controllers/dealer.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.patch("/", dealerController.updateDealer);

module.exports = router;
