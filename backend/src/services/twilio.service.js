const twilio = require("twilio");
const env = require("../config/env");
const logger = require("../utils/logger");

const client = twilio(env.twilio.accountSid, env.twilio.authToken);

/**
 * Sends a single message via WhatsApp or SMS. Called only by the queue
 * drain (messageQueue.service.js) — never inline from a request handler.
 */
async function sendMessage({ channel, toPhone, body, sensitive, contentSid, contentVariables }) {
  const from = channel === "whatsapp" ? env.twilio.whatsappFrom : env.twilio.smsFrom;
  const to = channel === "whatsapp" ? `whatsapp:${toPhone}` : toPhone;

  try {
    const content = contentSid
      ? { contentSid, contentVariables: JSON.stringify(contentVariables) }
      : { body };
    const message = await client.messages.create({ from, to, ...content });
    return { ok: true, sid: message.sid };
  } catch (err) {
    const error = sensitive ? "Private message delivery failed" : err.message;
    logger.error({ msg: "Twilio send failed", channel, err: error });
    return { ok: false, error };
  }
}

module.exports = { sendMessage };
