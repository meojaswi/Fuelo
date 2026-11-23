const { assertCan } = require("../services/entitlements.service");
const audit = require("../services/audit.service");
const { randomBytes } = require("node:crypto");
const Membership = require("../models/membership.model");
const UserAccount = require("../models/userAccount.model");
const { atomic, fail } = require("../services/atomic.service");
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
  const members = await Membership.find({ workspaceId: req.workspaceId }).sort({
    createdAt: 1,
    _id: 1,
  });
  const users = await UserAccount.find({
    _id: { $in: members.map((member) => member.userId) },
  }).select("name phone");
  const byId = new Map(users.map((user) => [String(user._id), user]));
  res.json({
    members: members.map((member) =>
      present(member, byId.get(String(member.userId)), req.user.userId)
    ),
  });
}

async function invite(req, res) {
  const { workspaceId } = req;
  const { name, phone, role } = req.body;
  const result = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    let user = await UserAccount.findOne({ phone }).session(session);
    if (user?.isActive === false) fail(409, "This account cannot be invited");
    const existing =
      user &&
      (await Membership.findOne({ workspaceId, userId: user._id })
        .select("+inviteTokenHash")
        .session(session));
    if (existing && existing.status !== "invited")
      fail(409, "This account already has a membership");
    await assertCan(workspaceId, "member:add", {
      workspace,
      session,
      seatReserved: existing?.inviteExpiresAt > new Date(),
    });
    if (!user) {
      try {
        user = await new UserAccount({ phone, name }).save({ session });
      } catch (err) {
        if (err.code !== 11000) throw err;
        if (session) {
          err.retryCustomerInsert = true;
          throw err;
        }
        user = await UserAccount.findOne({ phone }).orFail();
      }
    }
    const filter = { workspaceId, userId: user._id };
    const raw = workspaceId + "." + randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const changes = {
      role,
      status: "invited",
      invitedBy: req.user.userId,
      inviteTokenHash: digest(raw),
      inviteExpiresAt: expiresAt,
    };
    const member = await Membership.findOneAndUpdate(
      filter,
      { $set: changes },
      { upsert: true, new: true, session }
    );
    compensate(() =>
      existing
        ? Membership.updateOne(filter, {
            $set: Object.fromEntries(Object.keys(changes).map((key) => [key, existing[key]])),
          })
        : Membership.deleteOne(filter)
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
      context
    );
    return present(member, user, req.user.userId);
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
  const inviteTokenHash = digest(token);
  const passwordHash = password && (await hashPassword(password));
  const accepted = await atomic(workspaceId, async (context) => {
    const { session, compensate } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    const filter = {
      workspaceId,
      status: "invited",
      inviteTokenHash,
      inviteExpiresAt: { $gt: new Date() },
    };
    const member = await Membership.findOne(filter).session(session);
    if (!member) fail(400, "Invalid or expired invitation");
    await assertCan(workspaceId, "member:activate", { workspace, session });
    const user = await UserAccount.findById(member.userId).select("+passwordHash").session(session);
    if (!user || user.isActive === false) fail(400, "Invalid or expired invitation");
    if (!user.passwordHash) {
      if (!passwordHash) fail(400, "Set a password to accept this invitation");
      const updated = await UserAccount.updateOne(
        { _id: user._id, passwordHash: null },
        {
          $set: { passwordHash, name: name || user.name },
        },
        { session }
      );
      if (updated.modifiedCount)
        compensate(() =>
          UserAccount.updateOne(
            { _id: user._id, passwordHash },
            { $unset: { passwordHash: 1 }, $set: { name: user.name } }
          )
        );
    }
    await Membership.updateOne(
      filter,
      {
        $set: { status: "active", lastUsedAt: new Date() },
        $unset: { inviteTokenHash: 1, inviteExpiresAt: 1 },
      },
      { session }
    );
    invalidateAuth({ workspaceId, userId: user._id });
    return member;
  });
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
  const result = await atomic(workspaceId, async (context) => {
    const { session } = context;
    const workspace = await lockWorkspace(workspaceId, context);
    await assertCan(workspaceId, "write", { workspace, session });
    const scope = { workspaceId, _id: req.params.id };
    const member = await Membership.findOne(scope).session(session);
    if (!member) fail(404, "Member not found");
    const role = req.body?.role ?? member.role;
    const status = req.body?.status ?? member.status;
    if (String(member.userId) === req.user.userId && role !== member.role)
      fail(409, "You cannot change your own role");
    if (
      member.role === "owner" &&
      member.status === "active" &&
      (remove || role !== "owner" || status !== "active")
    ) {
      if (
        !(await Membership.exists({
          workspaceId,
          role: "owner",
          status: "active",
          _id: { $ne: member._id },
        }).session(session))
      ) {
        fail(409, "The workspace must keep at least one active owner");
      }
    }
    if (status === "active" && member.status === "disabled")
      await assertCan(workspaceId, "member:add", { workspace, session });
    const user = await UserAccount.findById(member.userId)
      .select("+passwordHash name phone")
      .session(session);
    if (remove) await Membership.deleteOne(scope, { session });
    else {
      if (status === "active" && (member.status === "invited" || !user?.passwordHash))
        fail(409, "The invite must be accepted first");
      member.role = role;
      member.status = status;
      await member.save({ session });
    }
    return present(member, user, req.user.userId);
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
