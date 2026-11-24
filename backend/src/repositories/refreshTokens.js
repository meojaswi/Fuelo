const { query } = require("../config/postgres");
const { requireWorkspaceId } = require("./workspaceScope");

const database = { query };
const tokenFields = `
  id AS "_id", user_id AS "userId", workspace_id AS "workspaceId",
  family_id AS "familyId", token_version AS "tokenVersion", revoked_at AS "revokedAt"
`;

async function insert(workspaceId, token, db = database) {
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens
       (workspace_id, user_id, token_version, family_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${tokenFields}`,
    [
      requireWorkspaceId(workspaceId),
      token.userId,
      token.tokenVersion,
      token.familyId,
      token.tokenHash,
      token.userAgent,
      token.expiresAt,
    ]
  );
  return rows[0];
}

async function findUnexpiredByHash(tokenHash, db = database) {
  const { rows } = await db.query(
    `SELECT ${tokenFields} FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()`,
    [tokenHash]
  );
  return rows[0];
}

async function claimForRotation(workspaceId, tokenId, db) {
  const { rows } = await db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND revoked_at IS NULL AND expires_at > now()
      RETURNING ${tokenFields}`,
    [requireWorkspaceId(workspaceId), tokenId]
  );
  return rows[0];
}

function setReplacement(workspaceId, tokenId, replacementId, db) {
  return db.query(
    `UPDATE refresh_tokens SET replaced_by = $3, updated_at = now()
      WHERE workspace_id = $1 AND id = $2`,
    [requireWorkspaceId(workspaceId), tokenId, replacementId]
  );
}

function revokeFamily(userId, familyId, db = database) {
  return db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), updated_at = now()
      WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`,
    [userId, familyId]
  );
}

function revokeAllForAccount(userId, db) {
  return db.query(
    `UPDATE refresh_tokens SET revoked_at = now(), updated_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

function switchWorkspace(workspaceId, tokenHash, userId, tokenVersion, db = database) {
  return db.query(
    `UPDATE refresh_tokens SET workspace_id = $1, updated_at = now()
      WHERE token_hash = $2 AND user_id = $3 AND token_version = $4
        AND revoked_at IS NULL AND expires_at > now()`,
    [requireWorkspaceId(workspaceId), tokenHash, userId, tokenVersion]
  );
}

module.exports = {
  insert,
  findUnexpiredByHash,
  claimForRotation,
  setReplacement,
  revokeFamily,
  revokeAllForAccount,
  switchWorkspace,
};
