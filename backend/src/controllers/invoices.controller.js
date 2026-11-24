const sales = require("../repositories/sales");
const { query } = require("../config/postgres");
const { calculateLines } = require("../services/timberStock.service");
const { allocateNumber, quoteTimberSale } = require("../services/gstInvoice.service");
const { reverseTimberSale } = require("../services/timberSales.service");
const { writeTimber } = require("../services/timberWrite.service");
const pdf = require("../services/pdf.service");
const { fail } = require("../services/atomic.service");
const audit = require("../services/audit.service");

const db = { query };

async function list(req, res) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const { invoices, total } = await sales.listInvoices(req.workspaceId, { page, limit: 30 });
  res.json({ invoices, total, page, pages: Math.max(1, Math.ceil(total / 30)) });
}

async function load(req) {
  const tx = await sales.getInvoice(db, req.workspaceId, req.params.id);
  if (!tx) fail(404, "Invoice not found");
  return tx;
}

async function get(req, res) {
  const tx = await load(req);
  const creditNote = await sales.getCreditNoteFor(db, req.workspaceId, tx._id);
  res.json({ invoice: tx, creditNote });
}

async function quote(req, res) {
  const lines = await calculateLines(req.workspaceId, req.body.lineItems, db);
  res.json({
    ...(await quoteTimberSale(req.timberWorkspace, req.body, lines, db)),
    lineItems: lines,
  });
}

async function makeCreditNote(req, res) {
  const { workspaceId } = req;
  const note = await writeTimber(req, "gst", async (context) => {
    const { db: tdb } = context;
    const tx = await sales.getInvoice(tdb, workspaceId, req.params.id, { lock: true });
    if (!tx) fail(404, "Invoice not found");
    if (tx.status !== "active") fail(409, "Invoice is already voided");
    if (tx.invoice?.type !== "tax_invoice")
      fail(409, "Use the sale void action for a bill of supply");
    const issuedAt = new Date();
    const number = await allocateNumber(workspaceId, issuedAt, "credit_note", "CN", context);
    const creditNote = await sales.insertCreditNote(tdb, workspaceId, {
      transactionId: tx._id,
      invoiceNumber: tx.invoiceNumber,
      number,
      issuedAt,
      reason: req.body.reason,
      issuedBy: req.user.userId,
    });
    await reverseTimberSale({ ...tx, voidedReason: req.body.reason }, req.user.userId, context);
    const result = await sales.markVoided(tdb, workspaceId, tx._id, {
      reason: req.body.reason,
      by: req.user.userId,
      at: issuedAt,
      creditNoteId: creditNote._id,
    });
    if (!result) fail(409, "Invoice is already voided");
    return creditNote;
  });
  await audit.record(req, {
    action: "invoice.credit_note",
    entityType: "transaction",
    entityId: note.transactionId,
    summary: "Issued credit note",
    meta: { number: note.number, reason: note.reason },
  });
  res.status(201).json(note);
}

async function download(req, res) {
  const tx = await load(req);
  const creditNote =
    req.query.kind === "credit_note"
      ? await sales.getCreditNoteFor(db, req.workspaceId, tx._id)
      : undefined;
  if (req.query.kind === "credit_note" && !creditNote) fail(404, "Credit note not found");
  res
    .type("application/pdf")
    .set("Content-Disposition", `inline; filename="invoice-${tx._id}.pdf"`);
  if (tx.invoice.type === "tax_invoice") return pdf.streamTaxInvoice(res, tx, creditNote);
  pdf.streamTransactionReceipt(res, { businessName: req.timberWorkspace.businessName, tx });
}

module.exports = { list, get, quote, makeCreditNote, download };
