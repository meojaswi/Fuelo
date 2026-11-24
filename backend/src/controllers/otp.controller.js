const audit = require("../services/audit.service");
const { createHmac, randomInt } = require("node:crypto");
const Otp = require("../repositories/passwordOtps");
const identity = require("../repositories/identity");
const { activeWorkspaces, changeCredentials } = require("./auth.controller");
const { hashPassword } = require("../services/auth.service");
const { enqueue } = require("../services/messageQueue.service");
const { withTransaction } = require("../config/postgres");
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
    const issued = await Otp.issue({
      phoneHash,
      codeHash: hash(phoneHash + ":" + code),
      sentAt: now,
      expiresAt: new Date(+now + 600_000),
      cooldownBefore: new Date(+now - 60_000),
    });
    if (issued) {
      const user = await identity.getActiveCredentials(phone);
      if (user?.passwordHash) {
        const [membership] = await activeWorkspaces(user._id);
        if (membership)
          await withTransaction((db) =>
            enqueue(
              {
            workspaceId: membership.workspace.workspaceId,
            channel: "whatsapp",
            toPhone: phone.length === 10 ? "+91" + phone : phone,
            ...buildPasswordOtp(code, membership.workspace),
            sensitive: true,
            deliveryExpiresAt: new Date(+now + 600_000),
              },
              { db }
            )
          );
      }
    }
  } catch {
    logger.error({ msg: "Password recovery request could not be queued" });
  }
  res
    .status(202)
    .json({ message: "If this phone can receive a code, it will arrive on WhatsApp." });
}

async function verify(req, res) {
  const { phone, code, password } = req.body;
  const phoneHash = hash("otp-phone:" + phone);
  const challenge = await Otp.recordAttempt(phoneHash, new Date());
  if (!challenge) fail(400, "Invalid or expired code");
  const claimed = await Otp.claim(challenge, hash(phoneHash + ":" + code), new Date());
  if (!claimed) fail(400, "Invalid or expired code");
  const user = await identity.getActiveCredentials(phone);
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
