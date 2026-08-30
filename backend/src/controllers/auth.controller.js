const Dealer = require("../models/dealer.model");
const authService = require("../services/auth.service");

async function login(req, res) {
  const { phone, password } = req.body;

  const dealer = await Dealer.findOne({ phone, isActive: true }).setOptions({
    skipWorkspaceGuard: true, // login happens before we know the workspace
  });

  if (!dealer) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  const valid = await authService.verifyPassword(password, dealer.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  const token = authService.signToken(dealer);
  res.json({
    token,
    dealer: {
      id: dealer._id,
      workspaceId: dealer.workspaceId,
      businessName: dealer.businessName,
      verticalType: dealer.verticalType,
    },
  });
}

module.exports = { login };
