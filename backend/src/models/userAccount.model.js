const mongoose = require("mongoose");

const userAccountSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, index: true },
    name: String,
    passwordHash: { type: String, select: false },
    workspaceWriteVersion: { type: Number, default: 0, select: false },
    tokenVersion: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserAccount", userAccountSchema);
