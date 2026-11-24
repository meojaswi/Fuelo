const { query } = require("../config/postgres");
const { requireWorkspaceId } = require("./workspaceScope");

function record(workspaceId, event) {
  return query(
    `INSERT INTO audit_logs
       (workspace_id, actor_user_id, actor_role, action, entity_type, entity_id, summary, meta, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      requireWorkspaceId(workspaceId),
      event.actorUserId,
      event.actorRole,
      event.action,
      event.entityType,
      event.entityId,
      event.summary,
      event.meta,
      event.ip,
      event.userAgent,
    ]
  );
}

async function list(workspaceId, { action, actor, start, end, page, limit }) {
  const filters = [requireWorkspaceId(workspaceId), action, actor, start, end];
  const where = `
    WHERE a.workspace_id = $1
      AND ($2::text IS NULL OR a.action = $2)
      AND ($3::uuid IS NULL OR a.actor_user_id = $3)
      AND ($4::timestamptz IS NULL OR a.created_at >= $4)
      AND ($5::timestamptz IS NULL OR a.created_at < $5)
  `;
  const [events, count] = await Promise.all([
    query(
      `SELECT a.id AS "_id", a.workspace_id AS "workspaceId", a.actor_user_id AS "actorUserId",
              a.actor_role AS "actorRole", a.action, a.entity_type AS "entityType",
              a.entity_id AS "entityId", a.summary, a.meta, a.ip, a.user_agent AS "userAgent",
              a.created_at AS "createdAt", a.updated_at AS "updatedAt", 0 AS "__v",
              u.name AS "actorName"
         FROM audit_logs a LEFT JOIN user_accounts u ON u.id = a.actor_user_id
         ${where}
        ORDER BY a.created_at DESC, a.id DESC LIMIT $6 OFFSET $7`,
      [...filters, limit, (page - 1) * limit]
    ),
    query(`SELECT count(*) AS total FROM audit_logs a ${where}`, filters),
  ]);
  return {
    events: events.rows.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null))
    ),
    total: Number(count.rows[0].total),
  };
}

module.exports = { record, list };
