const Dealer = require("../models/dealer.model");
const UserAccount = require("../models/userAccount.model");
const authService = require("../services/auth.service");
const { WorkspaceSubscription } = require("../models/subscription.model");
const { randomUUID } = require("node:crypto");

const defaultItemTypes = {
  fuel: ["Diesel", "Petrol", "CNG"],
  timber: ["Teak", "Sal", "Pine"],
  construction: ["Cement", "Steel", "Sand"],
  kirana: [],
  other: [],
};

function createWorkspaceId() {
  return `ws_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function serializeDealer(dealer) {
  return {
    id: dealer._id,
    workspaceId: dealer.workspaceId,
    businessName: dealer.businessName,
    verticalType: dealer.verticalType,
    config: dealer.config,
  };
}

function sessionFor(dealer, dealers) {
  return {
    token: authService.signToken(dealer),
    dealer: serializeDealer(dealer),
    workspaces: dealers.map(serializeDealer),
  };
}

async function signup(req, res) {
  const { phone, password, businessName, verticalType } = req.body;
  const existing = await Dealer.exists({ phone }).setOptions({ skipWorkspaceGuard: true });
  const conflict = () =>
    res.status(409).json({ error: "An account already exists for this phone" });
  if (existing) return conflict();

  const passwordHash = await authService.hashPassword(password);
  const dealer = new Dealer({
    workspaceId: createWorkspaceId(),
    businessName,
    verticalType,
    phone,
    passwordHash,
    config: { itemTypes: defaultItemTypes[verticalType] },
  });

  // Reserve the unique phone before creating the workspace so concurrent
  // signups cannot both succeed.
  let account;
  try {
    account = await UserAccount.create({ phone, passwordHash, dealerIds: [dealer._id] });
  } catch (err) {
    if (err.code === 11000) return conflict();
    throw err;
  }

  try {
    await dealer.save();
  } catch (err) {
    await UserAccount.deleteOne({ _id: account._id });
    throw err;
  }

  res.status(201).json(sessionFor(dealer, [dealer]));
}

async function login(req, res) {
  const { phone, password } = req.body;

  const dealers = await Dealer.find({ phone, isActive: true })
    .setOptions({ skipWorkspaceGuard: true })
    .sort({ createdAt: 1, _id: 1 });
  if (!dealers.length) return res.status(401).json({ error: "Invalid phone or password" });

  const account = await UserAccount.findOne({ phone });
  if (account) {
    if (await authService.verifyPassword(password, account.passwordHash)) {
      return res.json(sessionFor(dealers[0], dealers));
    }
  } else {
    // Existing phone accounts can have different hashes across workspaces.
    for (const dealer of dealers) {
      if (await authService.verifyPassword(password, dealer.passwordHash)) {
        return res.json(sessionFor(dealers[0], dealers));
      }
    }
  }

  return res.status(401).json({ error: "Invalid phone or password" });
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
  res.json(sessionFor(targetDealer, dealers));
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

  const workspaceId = createWorkspaceId();

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

  if (!currentDealer) return res.status(401).json({ error: "Unauthorized" });

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

  const account = await UserAccount.findOne({ phone: currentDealer.phone });
  const valid = await authService.verifyPassword(
    currentPassword,
    account?.passwordHash ?? currentDealer.passwordHash
  );
  if (!valid) {
    return res.status(401).json({ error: "Incorrect current password" });
  }

  const newHash = await authService.hashPassword(newPassword);

  if (account)
    await UserAccount.updateOne({ _id: account._id }, { $set: { passwordHash: newHash } });

  // Update password for all workspaces tied to this phone
  await Dealer.updateMany(
    { phone: currentDealer.phone },
    { $set: { passwordHash: newHash } }
  ).setOptions({ skipWorkspaceGuard: true });

  res.json({ ok: true });
}

module.exports = {
  signup,
  login,
  switchWorkspace,
  createWorkspace,
  deleteWorkspace,
  updatePassword,
};
