const express = require("express");
const authController = require("../controllers/auth.controller");
const { validateBody } = require("../middleware/validate.middleware");
const { loginSchema } = require("../validators/auth.schema");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/login", validateBody(loginSchema), authController.login);
router.post("/switch", requireAuth, authController.switchWorkspace);
router.post("/workspaces", requireAuth, authController.createWorkspace);
router.delete("/workspaces/:workspaceId", requireAuth, authController.deleteWorkspace);

module.exports = router;
