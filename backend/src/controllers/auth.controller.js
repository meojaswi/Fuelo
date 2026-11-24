const audit = require("../services/audit.service");
const { permissionsFor } = require("../config/permissions");
const identity = require("../repositories/identity");
const { withTransaction } = require("../config/postgres");
const sessions = require("../services/session.service");
const { invalidateAuth } = require("../middleware/auth.middleware");
const authService = require("../services/auth.service");
const { fail } = require("../services/atomic.service");
const { state, caps, assertCan, EntitlementError } = require("../services/entitlements.service");

const { getVertical } = require("../config/verticals");

function serialize(workspace, membership) {
  const { _id, workspaceId, businessName, verticalType, config, language, taxProfile } = workspace;
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
    taxRegistered: taxProfile?.taxRegistered === true,
    billing: state(workspace),
    role: membership.role,
    permissions: permissionsFor(membership.role),
  };
}

async function activeWorkspaces(userId, db) {
  return identity.listActiveWorkspacesForAccount(userId, db);
}

async function sessionFor(user, workspaceId) {
  const workspaces = await activeWorkspaces(user._id);
  const current = workspaceId
    ? workspaces.find((item) => item.workspace.workspaceId === workspaceId)
    : workspaces[0];
  if (!current) fail(404, "Active workspace not found");
  const { workspace, membership } = current;
  await identity.markWorkspaceUsed(workspace.workspaceId, membership._id);
  return {
    token: authService.signToken(workspace, user, membership),
    dealer: serialize(workspace, membership),
    workspaces: workspaces.map((item) => serialize(item.workspace, item.membership)),
    role: membership.role,
    permissions: permissionsFor(membership.role),
    account: { id: user._id, name: user.name, phone: user.phone },
  };
}

function workspaceInput({ businessName, verticalType }) {
  const items = getVertical(verticalType).items;
  return {
    businessName,
    verticalType,
    config: { itemTypes: Object.keys(items), itemUnits: items },
  };
}

async function signup(req, res) {
  const { phone, password, businessName, name } = req.body;
  const passwordHash = await authService.hashPassword(password);
  let created;
  try {
    created = await withTransaction(async (db) => {
      const account = await identity.createAccount(
        { phone, name: name || businessName, passwordHash },
        db
      );
      const owned = await identity.createOwnedWorkspace(account._id, workspaceInput(req.body), db);
      return { account, ...owned };
    });
  } catch (err) {
    if (err.code !== "23505") throw err;
    fail(409, "An account already exists for this phone");
  }
  const { account: user, workspace } = created;
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
  const user = await identity.getActiveCredentials(req.body.phone);
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
  if (typeof req.body.workspaceId !== "string") fail(400, "Workspace ID is required");
  const user = await identity.getAccount(req.user.userId);
  if (!user) fail(400, "Workspace ID is required");
  const session = await sessionFor(user, req.body.workspaceId);
  await sessions.switchToken(req.body.refreshToken, user, req.body.workspaceId);
  res.json(session);
}

async function createWorkspace(req, res) {
  const form = require("../validators/auth.schema")
    .signupSchema.pick({ businessName: true, verticalType: true })
    .safeParse(req.body);
  if (!form.success) fail(400, "Valid business name and type are required");
  const user = await identity.getAccount(req.user.userId);
  if (!user) fail(401, "Unauthorized");
  await assertCan(req.user.workspaceId, "write");
  const created = await withTransaction(async (db) => {
    // Serialize changes to the person's owned workspace count.
    await identity.lockAccountWorkspaceCount(user._id, db);
    const owners = (await activeWorkspaces(user._id, db)).filter(
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
    return identity.createOwnedWorkspace(user._id, workspaceInput(form.data), db);
  });
  await audit.record(req, {
    workspaceId: created.workspace.workspaceId,
    action: "workspace.create",
    entityType: "workspace",
    entityId: created.workspace.workspaceId,
    summary: "Created a workspace",
  });
  res.json(serialize(created.workspace, created.membership));
}

async function deleteWorkspace(req, res) {
  const { workspaceId } = req.params;
  if (req.user.workspaceId === workspaceId)
    fail(400, "Switch workspaces before deleting the active workspace");
  const member =
    identity.isId(workspaceId) && (await identity.isActiveOwner(workspaceId, req.user.userId));
  if (member) await assertCan(workspaceId, "write");
  if (!member || !(await identity.patchWorkspace(workspaceId, { isActive: false }))) {
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
  const user = await identity.getCredentials(req.user.userId);
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
  const updated = await withTransaction(async (db) => {
    const account = await identity.updateCredentials(userId, passwordHash ?? null, expectedVersion ?? null, db);
    if (account) await sessions.revokeAll(userId, db);
    return account;
  });
  if (!updated) fail(401, "Session no longer active");
  invalidateAuth({ userId });
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
  const workspace = await identity.getWorkspace(req.user.workspaceId);
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
