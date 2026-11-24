const auditLog = require("../repositories/auditLog");
const logger = require("../utils/logger");

async function record(req, event) {
  const workspaceId = event.workspaceId ?? req.workspaceId ?? req.user?.workspaceId;
  if (!workspaceId) return;
  try {
    await auditLog.record(workspaceId, {
      actorUserId: event.actorUserId ?? req.user?.userId ?? null,
      actorRole: event.actorRole ?? req.user?.role ?? null,
      action: event.action,
      entityType: event.entityType ?? null,
      entityId: event.entityId == null ? null : String(event.entityId),
      summary: event.summary ?? null,
      meta: event.meta ?? null,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch {
    logger.error({ msg: "Audit event write failed", workspaceId, action: event.action });
  }
}

module.exports = { record };
