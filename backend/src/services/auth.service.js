const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

async function verifyPassword(plain, hash) {
  return hash ? bcrypt.compare(plain, hash) : false;
}

function signToken(workspace, user, membership) {
  return jwt.sign(
    {
      userId: String(user._id),
      workspaceId: workspace.workspaceId,
      role: membership.role,
      tokenVersion: user.tokenVersion,
    },
    env.jwtSecret,
    { expiresIn: "15m", algorithm: "HS256" }
  );
}

module.exports = { hashPassword, verifyPassword, signToken };
