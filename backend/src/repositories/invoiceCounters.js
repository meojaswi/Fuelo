const { requireWorkspaceId } = require("./workspaceScope");

async function nextInvoiceSequence(client, workspaceId, year, kind) {
  const { rows } = await client.query(
    `INSERT INTO invoice_counters (workspace_id, year, kind, sequence)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (workspace_id, year, kind)
     DO UPDATE SET sequence = invoice_counters.sequence + 1, updated_at = now()
     RETURNING sequence`,
    [requireWorkspaceId(workspaceId), year, kind]
  );
  return Number(rows[0].sequence);
}

module.exports = { nextInvoiceSequence };
