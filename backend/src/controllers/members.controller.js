const { assertCan } = require("../services/entitlements.service");
const audit = require("../services/audit.service");
const { randomBytes } = require("node:crypto");
const identity = require("../repositories/identity");
const { withTransaction } = require("../config/postgres");
const { fail } = require("../services/atomic.service");
const { lockWorkspace } = require("../services/workspaceWrite.service");
const { hashPassword } = require("../services/auth.service");
const { digest } = require("../services/session.service");
const { enqueue } = require("../services/messageQueue.service");
const { buildInvite } = require("../services/messageBuilder.service");
const { invalidateAuth } = require("../middleware/auth.middleware");
const env = require("../config/env");

function present(member, user, actor) {
  return {
    id: member._id,
    userId: member.userId,
    role: member.role,
    status: member.status,
    name: user?.name,
    phone: user?.phone,
    createdAt: member.createdAt,
    lastUsedAt: member.lastUsedAt,
    self: String(member.userId) === actor,
  };
}

async function list(req, res) {
  const rows = await identity.listMembers(req.workspaceId);
  res.json({
    members: rows.map(({ member, user }) => present(member, user, req.user.userId)),
  });
}

async function invite(req, res) {
  const { workspaceId } = req;
  const { name, phone, role } = req.body;
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const raw = workspaceId + "." + randomBytes(32).toString("hex");
  const { result, workspace } = await withTransaction(async (db) => {
    const workspace = await lockWorkspace(workspaceId, { db });
    let user = await identity.findAccountByPhone(phone, db);
    if (user?.isActive === false) fail(409, "This account cannot be invited");
    const existing = user && (await identity.getMemberByUser(workspaceId, user._id, db));
    if (existing && existing.status !== "invited")
      fail(409, "This account already has a membership");
    await assertCan(workspaceId, "member:add", {
      workspace,
      db,
      seatReserved: existing?.inviteExpiresAt > new Date(),
    });
    user ??= await identity.createInvitedAccount({ phone, name }, db);
    if (!user) throw Object.assign(new Error("Concurrent invite"), { code: "40001" });
    const member = await identity.upsertInvite(
      workspaceId,
      user._id,
      {
        role,
        invitedBy: req.user.userId,
        inviteTokenHash: digest(raw),
        inviteExpiresAt: expiresAt,
      },
      db
    );
    await enqueue(
      {
        workspaceId,
        channel: "whatsapp",
        toPhone: phone.length === 10 ? "+91" + phone : phone,
        ...buildInvite(workspace, new URL("/invite/" + raw, env.publicAppUrl).href, raw),
        sensitive: true,
        deliveryExpiresAt: expiresAt,
      },
      { db }
    );
    return { result: present(member, user, req.user.userId), workspace };
  });
  await audit.record(req, {
    action: "member.invite",
    entityType: "membership",
    entityId: result.id,
    summary: "Invited a workspace member",
    meta: { role: result.role },
  });
  res.status(201).json(result);
}

async function accept(req, res) {
  const { token, password, name } = req.body;
  const workspaceId = token.split(".")[0];
  if (!identity.isId(workspaceId)) fail(400, "Invalid or expired invitation");
  const inviteTokenHash = digest(token);
  const passwordHash = password && (await hashPassword(password));
  const accepted = await withTransaction(async (db) => {
    const workspace = await lockWorkspace(workspaceId, { db }).catch((err) => {
      if (err.status === 404) fail(400, "Invalid or expired invitation");
      throw err;
    });
    const member = await identity.findInvite(workspaceId, inviteTokenHash, db);
    if (!member) fail(400, "Invalid or expired invitation");
    await assertCan(workspaceId, "member:activate", { workspace, db });
    const user = await identity.lockAccount(member.userId, db);
    if (!user || user.isActive === false) fail(400, "Invalid or expired invitation");
    const credentials = await identity.getCredentials(member.userId, db);
    if (!credentials.passwordHash) {
      if (!passwordHash) fail(400, "Set a password to accept this invitation");
      await identity.setInitialCredentials(user._id, passwordHash, name, db);
    }
    await identity.activateInvite(workspaceId, member._id, db);
    return member;
  });
  invalidateAuth({ workspaceId, userId: accepted.userId });
  await audit.record(req, {
    workspaceId,
    actorUserId: accepted.userId,
    actorRole: accepted.role,
    action: "member.accept",
    entityType: "membership",
    entityId: accepted._id,
    summary: "Accepted a workspace invitation",
  });
  res.json({ ok: true });
}

async function change(req, res, remove = false) {
  const { workspaceId } = req;
  const result = await withTransaction(async (db) => {
    const workspace = await lockWorkspace(workspaceId, { db });
    await assertCan(workspaceId, "write", { workspace, db });
    const member = await identity.getMember(workspaceId, req.params.id, db, { lock: true });
    if (!member) fail(404, "Member not found");
    const role = req.body?.role ?? member.role;
    const status = req.body?.status ?? member.status;
    if (String(member.userId) === req.user.userId && role !== member.role)
      fail(409, "You cannot change your own role");
    if (
      member.role === "owner" &&
      member.status === "active" &&
      (remove || role !== "owner" || status !== "active") &&
      !(await identity.hasOtherActiveOwner(workspaceId, member._id, db))
    ) {
      fail(409, "The workspace must keep at least one active owner");
    }
    if (status === "active" && member.status === "disabled")
      await assertCan(workspaceId, "member:add", { workspace, db });
    const user = await identity.getCredentials(member.userId, db);
    let current = member;
    if (remove) await identity.deleteMember(workspaceId, member._id, db);
    else {
      if (status === "active" && (member.status === "invited" || !user?.passwordHash))
        fail(409, "The invite must be accepted first");
      current = { ...member, ...(await identity.updateMember(workspaceId, member._id, { role, status }, db)) };
    }
    return present(current, user, req.user.userId);
  });
  invalidateAuth({ workspaceId, userId: result.userId });
  await audit.record(req, {
    action: remove
      ? "member.remove"
      : req.body?.role
        ? "member.role_change"
        : "member.status_change",
    entityType: "membership",
    entityId: result.id,
    summary: "Updated workspace membership",
    meta: { role: result.role, status: result.status },
  });
  res.json(remove ? { ok: true } : result);
}

module.exports = {
  list,
  invite,
  accept,
  patch: (req, res) => change(req, res),
  remove: (req, res) => change(req, res, true),
};
