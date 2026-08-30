const twilio = require("twilio");
const env = require("../config/env");
const logger = require("../utils/logger");

const client = twilio(env.twilio.accountSid, env.twilio.authToken);

/**
 * Sends a single message via WhatsApp or SMS. Called only by the queue
 * drain (messageQueue.service.js) — never inline from a request handler.
 */
async function sendMessage({ channel, toPhone, body }) {
  const from = channel === "whatsapp" ? env.twilio.whatsappFrom : env.twilio.smsFrom;
  const to = channel === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;

  try {
    const message = await client.messages.create({ from, to, body });
    return { ok: true, sid: message.sid };
  } catch (err) {
    logger.error({ msg: "Twilio send failed", channel, toPhone, err: err.message });
    return { ok: false, error: err.message };
  }
}

module.exports = { sendMessage };
