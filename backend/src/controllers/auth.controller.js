const audit = require("../services/audit.service");
const { permissionsFor } = require("../config/permissions");
const Workspace = require("../models/workspace.model");
const Membership = require("../models/membership.model");
const UserAccount = require("../models/userAccount.model");
const sessions = require("../services/session.service");
const { invalidateAuth } = require("../middleware/auth.middleware");
const authService = require("../services/auth.service");
const { atomic, fail } = require("../services/atomic.service");
const { state, caps, assertCan, EntitlementError } = require("../services/entitlements.service");
const { randomUUID } = require("node:crypto");

const { getVertical } = require("../config/verticals");

function serialize(workspace, membership) {
  const { _id, workspaceId, businessName, verticalType, config, language } = workspace;
  const vertical = getVertical(verticalType);
  return {
    id: _id,
    workspaceId,
    businessName,
    verticalType,
    config,
    language,
    verticalFeatures: vertical.flags,
    verticalLabels: vertical.labels,
    billing: state(workspace),
    role: membership.role,
    permissions: permissionsFor(membership.role),
  };
}

async function activeWorkspaces(userId, session) {
  const memberships = await Membership.find({ userId, status: "active" })
    .setOptions({ skipWorkspaceGuard: true })
    .sort({ lastUsedAt: -1, createdAt: 1, _id: 1 })
    .session(session);
  const workspaces = await Workspace.find({
    workspaceId: { $in: memberships.map((item) => item.workspaceId) },
    isActive: true,
  }).session(session);
  const lookup = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]));
  return memberships
    .filter((item) => lookup.has(item.workspaceId))
    .map((membership) => ({
      membership,
      workspace: lookup.get(membership.workspaceId),
    }));
}

async function sessionFor(user, workspaceId) {
  const workspaces = await activeWorkspaces(user._id);
  const current = workspaceId
    ? workspaces.find((item) => item.workspace.workspaceId === workspaceId)
    : workspaces[0];
  if (!current) fail(404, "Active workspace not found");
  const { workspace, membership } = current;
  await Membership.updateOne(
    { workspaceId: workspace.workspaceId, _id: membership._id },
    { $set: { lastUsedAt: new Date() } }
  );
  return {
    token: authService.signToken(workspace, user, membership),
    dealer: serialize(workspace, membership),
    workspaces: workspaces.map((item) => serialize(item.workspace, item.membership)),
    role: membership.role,
    permissions: permissionsFor(membership.role),
    account: { id: user._id, name: user.name, phone: user.phone },
  };
}

function makeWorkspace({ businessName, verticalType }) {
  return new Workspace({
    workspaceId: `ws_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    businessName,
    verticalType,
    config: {
      itemTypes: Object.keys(getVertical(verticalType).items),
      itemUnits: getVertical(verticalType).items,
    },
  });
}

async function saveWorkspace(workspace, user, { session, compensate }) {
  await workspace.save({ session });
  compensate(() => Workspace.deleteOne({ workspaceId: workspace.workspaceId }));
  const membership = await new Membership({
    workspaceId: workspace.workspaceId,
    userId: user._id,
    role: "owner",
  }).save({ session });
  compensate(() =>
    Membership.deleteOne({ workspaceId: workspace.workspaceId, _id: membership._id })
  );
  return membership;
}

async function signup(req, res) {
  const { phone, password, businessName, name } = req.body;
  const workspace = makeWorkspace(req.body);
  const passwordHash = await authService.hashPassword(password);
  let user;
  try {
    user = await atomic(workspace.workspaceId, async (context) => {
      const account = await new UserAccount({
        phone,
        name: name || businessName,
        passwordHash,
      }).save({ session: context.session });
      context.compensate(() => UserAccount.deleteOne({ _id: account._id }));
      await saveWorkspace(new Workspace(workspace.toObject()), account, context);
      return account;
    });
  } catch (err) {
    if (err.code !== 11000 || !err.keyPattern?.phone) throw err;
    fail(409, "An account already exists for this phone");
  }
  await audit.record(req, {
    workspaceId: workspace.workspaceId,
    actorUserId: user._id,
    actorRole: "owner",
    action: "workspace.create",
    entityType: "workspace",
    entityId: workspace.workspaceId,
    summary: "Created a workspace",
  });
  res.status(201).json(await newSession(req, user, workspace.workspaceId));
}

async function login(req, res) {
  const user = await UserAccount.findOne({
    phone: req.body.phone,
    isActive: { $ne: false },
  }).select("+passwordHash");
  if (!user || !(await authService.verifyPassword(req.body.password, user.passwordHash))) {
    const [known] = user ? await activeWorkspaces(user._id).catch(() => []) : [];
    if (known)
      await audit.record(req, {
        workspaceId: known.workspace.workspaceId,
        action: "auth.login_failed",
        summary: "Failed login attempt",
      });
    fail(401, "Invalid phone or password");
  }
  const session = await newSession(req, user);
  await audit.record(req, {
    workspaceId: session.dealer.workspaceId,
    actorUserId: user._id,
    actorRole: session.role,
    action: "auth.login",
    summary: "Signed in",
  });
  res.json(session);
}

async function switchWorkspace(req, res) {
  const user = await UserAccount.findById(req.user.userId);
  if (!user || typeof req.body.workspaceId !== "string") fail(400, "Workspace ID is required");
  const session = await sessionFor(user, req.body.workspaceId);
  await sessions.switchToken(req.body.refreshToken, user, req.body.workspaceId);
  res.json(session);
}

async function createWorkspace(req, res) {
  const form = require("../validators/auth.schema")
    .signupSchema.pick({ businessName: true, verticalType: true })
    .safeParse(req.body);
  if (!form.success) fail(400, "Valid business name and type are required");
  const user = await UserAccount.findById(req.user.userId);
  if (!user) fail(401, "Unauthorized");
  await assertCan(req.user.workspaceId, "write");
  const workspace = makeWorkspace(form.data);
  const membership = await atomic("account:" + user._id, async (context) => {
    // Serialize changes to the person's owned workspace count.
    await UserAccount.updateOne(
      { _id: user._id },
      { $inc: { workspaceWriteVersion: 1 } },
      { session: context.session }
    );
    const owners = (await activeWorkspaces(user._id, context.session)).filter(
      ({ membership }) => membership.role === "owner"
    );
    const activePlans = owners
      .map((item) => item.workspace)
      .filter((item) => state(item).status === "active" && !state(item).readOnly);
    const maxWorkspaces = activePlans.length
      ? Math.max(...activePlans.map((item) => caps(item).maxWorkspaces))
      : 2;
    if (owners.length >= maxWorkspaces)
      throw new EntitlementError(
        "FEATURE_NOT_IN_PLAN",
        "Your plan has reached its workspace limit."
      );
    return saveWorkspace(new Workspace(workspace.toObject()), user, context);
  });
  await audit.record(req, {
    workspaceId: workspace.workspaceId,
    action: "workspace.create",
    entityType: "workspace",
    entityId: workspace.workspaceId,
    summary: "Created a workspace",
  });
  res.json(serialize(workspace, membership));
}

async function deleteWorkspace(req, res) {
  const { workspaceId } = req.params;
  if (req.user.workspaceId === workspaceId)
    fail(400, "Switch workspaces before deleting the active workspace");
  const member = await Membership.exists({
    workspaceId,
    userId: req.user.userId,
    role: "owner",
    status: "active",
  });
  if (member) await assertCan(workspaceId, "write");
  if (
    !member ||
    !(await Workspace.findOneAndUpdate(
      { workspaceId, isActive: true },
      { $set: { isActive: false } }
    ))
  ) {
    fail(404, "Workspace not found");
  }
  invalidateAuth({ workspaceId });
  await audit.record(req, {
    workspaceId,
    action: "workspace.delete",
    entityType: "workspace",
    entityId: workspaceId,
    summary: "Deactivated a workspace",
  });
  res.json({ ok: true });
}

async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword) > 72
  )
    fail(
      400,
      "Provide the current password and a new password of at least 8 characters and at most 72 bytes"
    );
  const user = await UserAccount.findById(req.user.userId).select("+passwordHash");
  if (!user || !(await authService.verifyPassword(currentPassword, user.passwordHash)))
    fail(401, "Incorrect current password");
  const updated = await changeCredentials(
    user._id,
    await authService.hashPassword(newPassword),
    user.tokenVersion
  );
  await audit.record(req, { action: "auth.password_change", summary: "Changed account password" });
  res.json(await newSession(req, updated, req.user.workspaceId));
}

async function newSession(req, user, workspaceId) {
  const data = await sessionFor(user, workspaceId);
  const token = await sessions.issue(user, data.dealer.workspaceId, req.get("user-agent"));
  return { ...data, refreshToken: token.raw };
}

async function changeCredentials(userId, passwordHash, expectedVersion) {
  const filter = { _id: userId, isActive: { $ne: false } };
  if (expectedVersion !== undefined) {
    if (expectedVersion === 0)
      filter.$or = [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }];
    else filter.tokenVersion = expectedVersion;
  }
  const update = { $inc: { tokenVersion: 1 } };
  if (passwordHash) update.$set = { passwordHash };
  const updated = await UserAccount.findOneAndUpdate(filter, update, { new: true });
  if (!updated) fail(401, "Session no longer active");
  invalidateAuth({ userId });
  await sessions.revokeAll(userId);
  return updated;
}

async function refresh(req, res) {
  const { user, workspaceId, refreshToken } = await sessions.rotate(
    req.body?.refreshToken,
    req.get("user-agent")
  );
  res.json({ ...(await sessionFor(user, workspaceId)), refreshToken });
}

async function logout(req, res) {
  await sessions.revoke(req.body?.refreshToken);
  res.json({ ok: true });
}

async function getSession(req, res) {
  const workspace = await Workspace.findOne({ workspaceId: req.user.workspaceId, isActive: true });
  if (!workspace) fail(401, "Session no longer active");
  res.json({ dealer: serialize(workspace, { role: req.user.role }) });
}

async function logoutAll(req, res) {
  await changeCredentials(req.user.userId, null);
  res.json({ ok: true });
}

module.exports = {
  signup,
  login,
  switchWorkspace,
  createWorkspace,
  deleteWorkspace,
  updatePassword,
  activeWorkspaces,
  sessionFor,
  newSession,
  changeCredentials,
  refresh,
  logout,
  logoutAll,
  getSession,
};
