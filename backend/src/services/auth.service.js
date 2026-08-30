const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(dealer) {
  return jwt.sign(
    { dealerId: dealer._id.toString(), workspaceId: dealer.workspaceId },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

module.exports = { hashPassword, verifyPassword, signToken };
