const mongoose = require("mongoose");

// Recovery challenges belong to a phone identity, including unknown phones.
const schema = new mongoose.Schema({
  phoneHash: { type: String, unique: true, required: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, expires: 0 },
  sentAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  usedAt: Date,
});
module.exports = mongoose.model("PasswordOtp", schema);
