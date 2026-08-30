const express = require("express");
const authController = require("../controllers/auth.controller");
const { validateBody } = require("../middleware/validate.middleware");
const { loginSchema } = require("../validators/auth.schema");

const router = express.Router();

router.post("/login", validateBody(loginSchema), authController.login);

module.exports = router;
