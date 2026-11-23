const mongoose = require("mongoose");
const { requireWorkspaceScope } = require("../middleware/workspaceScope.middleware");

const schema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "UserAccount" },
    actorRole: String,
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    summary: String,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ workspaceId: 1, createdAt: -1, _id: -1 });
schema.plugin(requireWorkspaceScope);
module.exports = mongoose.model("AuditLog", schema);
