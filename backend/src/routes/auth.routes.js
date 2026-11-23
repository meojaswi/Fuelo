const express = require("express");
const { requirePermission } = require("../middleware/permission.middleware");
const authController = require("../controllers/auth.controller");
const { validateBody } = require("../middleware/validate.middleware");
const {
  loginSchema,
  signupSchema,
  otpRequestSchema,
  otpVerifySchema,
} = require("../validators/auth.schema");
const { requireAuth, requireFreshAuth } = require("../middleware/auth.middleware");

const asyncHandler = require("../middleware/asyncHandler.middleware");

const { rateLimit } = require("express-rate-limit");
const members = require("../controllers/members.controller");
const { acceptSchema } = require("../validators/members.schema");
const otp = require("../controllers/otp.controller");
const otpIp = rateLimit({ windowMs: 15 * 60000, limit: 30, message: { error: "Try again later" } });
const otpPhone = rateLimit({
  windowMs: 15 * 60000,
  limit: 12,
  keyGenerator: (req) => req.body.phone,
  message: { error: "Try again later" },
});
const router = express.Router();

router.post("/signup", validateBody(signupSchema), asyncHandler(authController.signup));
router.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
router.post(
  "/switch",
  requireAuth,
  requirePermission("account:manage"),
  asyncHandler(authController.switchWorkspace)
);
router.post(
  "/workspaces",
  requireAuth,
  requirePermission("workspace:create"),
  asyncHandler(authController.createWorkspace)
);
router.delete(
  "/workspaces/:workspaceId",
  requireAuth,
  requirePermission("workspace:delete"),
  asyncHandler(authController.deleteWorkspace)
);
router.patch(
  "/password",
  requireAuth,
  requirePermission("account:manage"),
  asyncHandler(authController.updatePassword)
);

router.get(
  "/session",
  requireFreshAuth,
  requirePermission("account:manage"),
  asyncHandler(authController.getSession)
);
router.post("/refresh", asyncHandler(authController.refresh));
router.post("/logout", asyncHandler(authController.logout));
router.post(
  "/logout-all",
  requireAuth,
  requirePermission("account:manage"),
  asyncHandler(authController.logoutAll)
);
router.post(
  "/otp/request",
  otpIp,
  validateBody(otpRequestSchema),
  otpPhone,
  asyncHandler(otp.request)
);
router.post(
  "/otp/verify",
  otpIp,
  validateBody(otpVerifySchema),
  otpPhone,
  asyncHandler(otp.verify)
);

router.post("/accept-invite", otpIp, validateBody(acceptSchema), asyncHandler(members.accept));

module.exports = router;
