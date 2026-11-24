const sales = require("../repositories/sales");
const { query } = require("../config/postgres");
const { istDateString, istDayBoundsUTC } = require("../utils/datetime");
const { roundMoney } = require("../utils/money");
const { assertCan } = require("../services/entitlements.service");
const { csvCells } = require("../utils/csv");
const { fail } = require("../services/atomic.service");

const notice = "Working summary for your accountant. This does not file a GST return.";
const valueFields = ["taxableValue", "cgst", "sgst", "igst"];

function range(query) {
  const { from, to } = query;
  if (typeof from !== "string" || typeof to !== "string")
    fail(400, "Enter a from and to date (YYYY-MM-DD)");
  try {
    const start = istDayBoundsUTC(from).startUTC;
    const end = istDayBoundsUTC(to).endUTC;
    if (end <= start || end - start > 366 * 86400000)
      fail(400, "Choose a date range of up to 366 days");
    return { from: start, to: end };
  } catch (err) {
    if (err instanceof RangeError) fail(400, "Enter valid dates");
    throw err;
  }
}

async function summary(req, res) {
  const { workspaceId } = req;
  const window = range(req.query);
  const { notes, invoices, credited } = await sales.taxInvoicesInWindow(workspaceId, window, { query });
  const groups = new Map();
  function add(invoice, date, sign) {
    const month = istDateString(date).slice(0, 7);
    for (const row of invoice.tax.rows) {
      if (row.kind === "charge" && !row.taxable) continue;
      const hsn = row.hsnCode ?? "Charges";
      const key = JSON.stringify([month, hsn, row.gstRatePercent]);
      if (!groups.has(key))
        groups.set(key, {
          month,
          hsn,
          rate: row.gstRatePercent,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        });
      const balance = groups.get(key);
      for (const field of valueFields)
        balance[field] = roundMoney(balance[field] + sign * row[field]);
    }
  }
  // A credit note reduces the issued invoice in its own period. Keep both sides of that pair.
  for (const { invoice } of invoices) add(invoice, new Date(invoice.issuedAt), 1);
  for (const note of notes) {
    const invoice = credited.get(note.transactionId);
    if (invoice) add(invoice, note.issuedAt, -1);
  }
  const rows = [...groups.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.hsn.localeCompare(b.hsn) || a.rate - b.rate
  );
  if (req.query.format === "csv") {
    await assertCan(workspaceId, "feature:csvExport", { workspace: req.timberWorkspace });
    res.set("Content-Disposition", 'attachment; filename="gst-summary.csv"');
    return res
      .type("text/csv")
      .send(
        [
          csvCells(["Month", "HSN", "Rate %", "Taxable value", "CGST", "SGST", "IGST"]),
          ...rows.map((row) =>
            csvCells([row.month, row.hsn, row.rate, ...valueFields.map((key) => row[key])])
          ),
        ].join("\r\n") + "\r\n"
      );
  }
  res.json({ notice, rows });
}

module.exports = { summary, range };
