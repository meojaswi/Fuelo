// The caller owns the transaction and lock until it records the outcome.
async function claimPendingMessage(client) {
  const { rows } = await client.query(
    `SELECT id, workspace_id, transaction_id, channel, to_phone, body,
            sensitive, delivery_expires_at, content_sid, content_variables,
            attempts, max_attempts
       FROM message_jobs
      WHERE status = 'pending' AND attempts < max_attempts
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED`
  );
  return rows[0];
}

module.exports = { claimPendingMessage };
