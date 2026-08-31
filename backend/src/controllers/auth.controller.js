const Dealer = require("../models/dealer.model");
const authService = require("../services/auth.service");
const { WorkspaceSubscription } = require("../models/subscription.model");
const { v4: uuidv4 } = require("uuid");

async function login(req, res) {
  const { phone, password } = req.body;

  const dealers = await Dealer.find({ phone, isActive: true }).setOptions({
    skipWorkspaceGuard: true,
  });

  if (!dealers.length) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  // Assuming password is the same across all workspaces for the phone
  const valid = await authService.verifyPassword(password, dealers[0].passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid phone or password" });
  }

  const dealer = dealers[0];

  const token = authService.signToken(dealer);
  res.json({
    token,
    dealer: {
      id: dealer._id,
      workspaceId: dealer.workspaceId,
      businessName: dealer.businessName,
      verticalType: dealer.verticalType,
    },
    workspaces: dealers.map((d) => ({
      id: d._id,
      workspaceId: d.workspaceId,
      businessName: d.businessName,
      verticalType: d.verticalType,
    })),
  });
}

async function switchWorkspace(req, res) {
  const { workspaceId } = req.body;
  const currentDealer = await Dealer.findById(req.user.dealerId).setOptions({
    skipWorkspaceGuard: true,
  });
  if (!currentDealer) return res.status(401).json({ error: "Unauthorized" });

  const targetDealer = await Dealer.findOne({
    phone: currentDealer.phone,
    workspaceId,
    isActive: true,
  }).setOptions({ skipWorkspaceGuard: true });
  if (!targetDealer) return res.status(404).json({ error: "Workspace not found" });

  const dealers = await Dealer.find({ phone: currentDealer.phone, isActive: true }).setOptions({
    skipWorkspaceGuard: true,
  });
  const token = authService.signToken(targetDealer);

  res.json({
    token,
    dealer: {
      id: targetDealer._id,
      workspaceId: targetDealer.workspaceId,
      businessName: targetDealer.businessName,
      verticalType: targetDealer.verticalType,
    },
    workspaces: dealers.map((d) => ({
      id: d._id,
      workspaceId: d.workspaceId,
      businessName: d.businessName,
      verticalType: d.verticalType,
    })),
  });
}

async function createWorkspace(req, res) {
  const { businessName, verticalType } = req.body;
  const currentDealer = await Dealer.findById(req.user.dealerId).setOptions({
    skipWorkspaceGuard: true,
  });
  if (!currentDealer) return res.status(401).json({ error: "Unauthorized" });

  const phone = currentDealer.phone;
  const dealers = await Dealer.find({ phone, isActive: true }).setOptions({
    skipWorkspaceGuard: true,
  });

  if (dealers.length >= 2) {
    // Check if ANY workspace has a premium subscription
    let hasPremium = false;
    for (const d of dealers) {
      const sub = await WorkspaceSubscription.findOne({
        workspaceId: d.workspaceId,
        status: "active",
      }).setOptions({ skipWorkspaceGuard: true });
      if (sub) {
        hasPremium = true;
        break;
      }
    }
    if (!hasPremium) {
      return res
        .status(403)
        .json({ error: "Premium feature: Upgrade to add more than 2 workspaces." });
    }
  }

  const workspaceId = `ws_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

  const newDealer = new Dealer({
    workspaceId,
    businessName,
    verticalType,
    phone,
    passwordHash: currentDealer.passwordHash,
  });
  await newDealer.save();

  res.json({
    id: newDealer._id,
    workspaceId: newDealer.workspaceId,
    businessName: newDealer.businessName,
    verticalType: newDealer.verticalType,
  });
}

async function deleteWorkspace(req, res) {
  const { workspaceId } = req.params;
  const currentDealer = await Dealer.findById(req.user.dealerId).setOptions({
    skipWorkspaceGuard: true,
  });

  if (currentDealer.workspaceId === workspaceId) {
    return res
      .status(400)
      .json({ error: "Cannot delete the currently active workspace. Switch first." });
  }

  const targetDealer = await Dealer.findOne({ phone: currentDealer.phone, workspaceId }).setOptions(
    { skipWorkspaceGuard: true }
  );
  if (!targetDealer) return res.status(404).json({ error: "Workspace not found" });

  targetDealer.isActive = false;
  await targetDealer.save();

  res.json({ ok: true });
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Missing password fields" });
  }

  const currentDealer = await Dealer.findById(req.user.dealerId).setOptions({
    skipWorkspaceGuard: true,
  });
  if (!currentDealer) return res.status(401).json({ error: "Unauthorized" });

  const valid = await authService.verifyPassword(currentPassword, currentDealer.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Incorrect current password" });
  }

  const newHash = await authService.hashPassword(newPassword);

  // Update password for all workspaces tied to this phone
  await Dealer.updateMany(
    { phone: currentDealer.phone },
    { $set: { passwordHash: newHash } }
  ).setOptions({ skipWorkspaceGuard: true });

  res.json({ ok: true });
}

module.exports = { login, switchWorkspace, createWorkspace, deleteWorkspace, updatePassword };
