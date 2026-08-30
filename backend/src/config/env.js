require("dotenv").config();

const required = ["MONGO_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    // Fail fast at boot rather than deep inside a request handler.
    throw new Error(`Missing required env var: ${key}`);
  }
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "8000", 10),

  mongoUri: process.env.MONGO_URI,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10),

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
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
