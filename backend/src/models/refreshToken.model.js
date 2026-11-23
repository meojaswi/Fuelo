const mongoose = require("mongoose");

// Account credentials are global. workspaceId records the currently selected workspace.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccount", required: true },
    workspaceId: { type: String, required: true },
    tokenVersion: { type: Number, required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, unique: true, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
    userAgent: String,
    revokedAt: Date,
    replacedBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ userId: 1, familyId: 1 });
module.exports = mongoose.model("RefreshToken", schema);
