const { query } = require("../config/postgres");

async function issue({ phoneHash, codeHash, sentAt, expiresAt, cooldownBefore }) {
  const { rowCount } = await query(
    `INSERT INTO password_otps (phone_hash, code_hash, sent_at, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (phone_hash) DO UPDATE SET
       code_hash = EXCLUDED.code_hash,
       sent_at = EXCLUDED.sent_at,
       expires_at = EXCLUDED.expires_at,
       attempts = 0,
       used_at = NULL,
       updated_at = now()
     WHERE password_otps.sent_at <= $5`,
    [phoneHash, codeHash, sentAt, expiresAt, cooldownBefore]
  );
  return rowCount === 1;
}

async function recordAttempt(phoneHash, now) {
  const { rows } = await query(
    `UPDATE password_otps
        SET attempts = attempts + 1, updated_at = now()
      WHERE phone_hash = $1 AND expires_at > $2 AND attempts < 5 AND used_at IS NULL
      RETURNING id, sent_at AS "sentAt"`,
    [phoneHash, now]
  );
  return rows[0];
}

async function claim({ id, sentAt }, codeHash, now) {
  const { rowCount } = await query(
    `UPDATE password_otps
        SET used_at = $4, updated_at = now()
      WHERE id = $1 AND sent_at = $2 AND code_hash = $3 AND expires_at > $4 AND used_at IS NULL`,
    [id, sentAt, codeHash, now]
  );
  return rowCount === 1;
}

function deleteExpired(now = new Date()) {
  return query("DELETE FROM password_otps WHERE expires_at <= $1", [now]);
}

module.exports = { issue, recordAttempt, claim, deleteExpired };
