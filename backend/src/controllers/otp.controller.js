const audit = require("../services/audit.service");
const { createHmac, randomInt } = require("node:crypto");
const Otp = require("../models/passwordOtp.model");
const UserAccount = require("../models/userAccount.model");
const { activeWorkspaces, changeCredentials } = require("./auth.controller");
const { hashPassword } = require("../services/auth.service");
const { enqueue } = require("../services/messageQueue.service");
const { buildPasswordOtp } = require("../services/messageBuilder.service");
const { fail } = require("../services/atomic.service");
const env = require("../config/env");
const logger = require("../utils/logger");

function hash(value) {
  return createHmac("sha256", env.jwtSecret).update(value).digest("hex");
}

async function request(req, res) {
  const { phone } = req.body;
  const phoneHash = hash("otp-phone:" + phone);
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const now = new Date();
  try {
    await Otp.updateOne(
      { phoneHash, sentAt: { $lte: new Date(+now - 60_000) } },
      {
        $setOnInsert: { phoneHash },
        $set: {
          codeHash: hash(phoneHash + ":" + code),
          sentAt: now,
          expiresAt: new Date(+now + 600_000),
          attempts: 0,
        },
        $unset: { usedAt: 1 },
      },
      { upsert: true }
    );
    const user = await UserAccount.findOne({ phone, isActive: { $ne: false } }).select(
      "+passwordHash"
    );
    if (user?.passwordHash) {
      const [membership] = await activeWorkspaces(user._id);
      if (membership)
        await enqueue({
          workspaceId: membership.workspace.workspaceId,
          channel: "whatsapp",
          toPhone: phone.length === 10 ? "+91" + phone : phone,
          ...buildPasswordOtp(code, membership.workspace),
          sensitive: true,
          deliveryExpiresAt: new Date(+now + 600_000),
        });
    }
  } catch (err) {
    if (err.code !== 11000) logger.error({ msg: "Password recovery request could not be queued" });
  }
  res
    .status(202)
    .json({ message: "If this phone can receive a code, it will arrive on WhatsApp." });
}

async function verify(req, res) {
  const { phone, code, password } = req.body;
  const phoneHash = hash("otp-phone:" + phone);
  const filter = { phoneHash, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 }, usedAt: null };
  const challenge = await Otp.findOneAndUpdate(filter, { $inc: { attempts: 1 } }, { new: true });
  if (!challenge) fail(400, "Invalid or expired code");
  const claimed = await Otp.findOneAndUpdate(
    {
      _id: challenge._id,
      sentAt: challenge.sentAt,
      expiresAt: { $gt: new Date() },
      usedAt: null,
      codeHash: hash(phoneHash + ":" + code),
    },
    { $set: { usedAt: new Date() } }
  );
  if (!claimed) fail(400, "Invalid or expired code");
  const user = await UserAccount.findOne({ phone, isActive: { $ne: false } }).select(
    "+passwordHash"
  );
  if (!user?.passwordHash) fail(400, "Invalid or expired code");
  await changeCredentials(user._id, await hashPassword(password));
  const [known] = await activeWorkspaces(user._id).catch(() => []);
  if (known)
    await audit.record(req, {
      workspaceId: known.workspace.workspaceId,
      actorUserId: user._id,
      actorRole: known.membership.role,
      action: "auth.password_change",
      summary: "Reset account password",
    });
  res.json({ ok: true });
}

module.exports = { request, verify };
