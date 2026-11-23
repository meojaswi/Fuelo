const express = require("express");
const authController = require("../controllers/auth.controller");
const { validateBody } = require("../middleware/validate.middleware");
const { loginSchema, signupSchema } = require("../validators/auth.schema");
const { requireAuth } = require("../middleware/auth.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const router = express.Router();

router.post("/signup", validateBody(signupSchema), asyncHandler(authController.signup));
router.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
router.post("/switch", requireAuth, asyncHandler(authController.switchWorkspace));
router.post("/workspaces", requireAuth, asyncHandler(authController.createWorkspace));
router.delete("/workspaces/:workspaceId", requireAuth, asyncHandler(authController.deleteWorkspace));
router.patch("/password", requireAuth, asyncHandler(authController.updatePassword));

module.exports = router;
