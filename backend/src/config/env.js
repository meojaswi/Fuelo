if (process.env.NODE_ENV !== "test") require("dotenv").config();

const { connectionOptions } = require("./postgres");

const required = ["MONGO_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    // Fail fast at boot rather than deep inside a request handler.
    throw new Error(`Missing required env var: ${key}`);
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
if (nodeEnv !== "test" || process.env.DATABASE_URL) connectionOptions();
if (nodeEnv === "production" && process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer");
}

module.exports = {
  nodeEnv,
  publicAppUrl: process.env.PUBLIC_APP_URL || "http://localhost:5173",
  trustProxyHops,
  corsOrigins: (
    process.env.CORS_ORIGINS ?? (nodeEnv === "development" ? "http://localhost:5173" : "")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  port: parseInt(process.env.PORT || "8000", 10),

  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10),

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
    otpContentSidHi: process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID_HI,
    inviteContentSidHi: process.env.TWILIO_WHATSAPP_INVITE_CONTENT_SID_HI,
    otpContentSid: process.env.TWILIO_WHATSAPP_OTP_CONTENT_SID,
    inviteContentSid: process.env.TWILIO_WHATSAPP_INVITE_CONTENT_SID,
    reminderContentSid: process.env.TWILIO_WHATSAPP_DUES_REMINDER_CONTENT_SID,
    reminderContentSidHi: process.env.TWILIO_WHATSAPP_DUES_REMINDER_CONTENT_SID_HI,
    varianceContentSid: process.env.TWILIO_WHATSAPP_SHIFT_VARIANCE_CONTENT_SID,
    varianceContentSidHi: process.env.TWILIO_WHATSAPP_SHIFT_VARIANCE_CONTENT_SID_HI,
    smsFrom: process.env.TWILIO_SMS_FROM,
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  linkToken: {
    secret: process.env.LINK_TOKEN_SECRET || process.env.JWT_SECRET,
    ttlHours: parseInt(process.env.LINK_TOKEN_TTL_HOURS || "48", 10),
  },
};
