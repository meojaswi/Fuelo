const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAccount",
      required: true,
      index: true,
    },
    role: { type: String, enum: ["owner", "manager", "attendant"], required: true },
    status: { type: String, enum: ["active", "invited", "disabled"], default: "active" },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccount" },
    lastUsedAt: Date,
    inviteTokenHash: { type: String, select: false },
    inviteExpiresAt: Date,
  },
  { timestamps: true }
);
schema.index({ workspaceId: 1, userId: 1 }, { unique: true });
schema.index({ workspaceId: 1, role: 1, status: 1 });
schema.index({ workspaceId: 1, inviteTokenHash: 1 });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("Membership", schema);
