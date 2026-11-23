const express = require("express");
const dealerController = require("../controllers/dealer.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { attachWorkspace } = require("../middleware/workspaceScope.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.use(requireAuth, attachWorkspace);

router.patch("/", asyncHandler(dealerController.updateDealer));

module.exports = router;
