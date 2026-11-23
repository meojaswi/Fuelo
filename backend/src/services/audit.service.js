const AuditLog = require("../models/auditLog.model");
const logger = require("../utils/logger");

async function record(req, event) {
  const workspaceId = event.workspaceId ?? req.workspaceId ?? req.user?.workspaceId;
  if (!workspaceId) return;
  try {
    await AuditLog.create({
      workspaceId,
      actorUserId: event.actorUserId ?? req.user?.userId,
      actorRole: event.actorRole ?? req.user?.role,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId == null ? undefined : String(event.entityId),
      summary: event.summary,
      meta: event.meta,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 300),
    });
  } catch {
    logger.error({ msg: "Audit event write failed", workspaceId, action: event.action });
  }
}

module.exports = { record };
