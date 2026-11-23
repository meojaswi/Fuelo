const Transaction = require("../models/transaction.model");
const CreditNote = require("../models/creditNote.model");
const { calculateLines } = require("../services/timberStock.service");
const { allocateNumber, quoteTimberSale } = require("../services/gstInvoice.service");
const { reverseTimberSale } = require("../services/timberSales.service");
const { writeTimber } = require("../services/timberWrite.service");
const pdf = require("../services/pdf.service");
const { fail } = require("../services/atomic.service");
const audit = require("../services/audit.service");

const scopeFor = (req) => ({
  workspaceId: req.workspaceId,
  _id: req.params.id,
  invoiceNumber: { $exists: true },
});

async function list(req, res) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const filter = { workspaceId: req.workspaceId, invoiceNumber: { $exists: true } };
  const [invoices, total] = await Promise.all([
    Transaction.find(filter)
      .select("invoiceNumber createdAt customerName amount status invoice.type creditNoteId")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 30)
      .limit(30),
    Transaction.countDocuments(filter),
  ]);
  res.json({ invoices, total, page, pages: Math.max(1, Math.ceil(total / 30)) });
}

async function load(req) {
  const tx = await Transaction.findOne(scopeFor(req));
  if (!tx) fail(404, "Invoice not found");
  return tx;
}

async function get(req, res) {
  const tx = await load(req);
  const creditNote = await CreditNote.findOne({
    workspaceId: req.workspaceId,
    transactionId: tx._id,
  });
  res.json({ invoice: tx, creditNote });
}

async function quote(req, res) {
  const lines = await calculateLines(req.workspaceId, req.body.lineItems);
  res.json({ ...(await quoteTimberSale(req.timberWorkspace, req.body, lines)), lineItems: lines });
}

async function makeCreditNote(req, res) {
  const { workspaceId } = req;
  const note = await writeTimber(req, "gst", async (context) => {
    const { session, compensate } = context;
    const scope = scopeFor(req);
    const tx = await Transaction.findOne(scope).session(session);
    if (!tx) fail(404, "Invoice not found");
    if (tx.status !== "active") fail(409, "Invoice is already voided");
    if (tx.invoice?.type !== "tax_invoice")
      fail(409, "Use the sale void action for a bill of supply");
    const issuedAt = new Date();
    const number = await allocateNumber(workspaceId, issuedAt, "credit_note", "CN", context);
    const creditNote = new CreditNote({
      workspaceId,
      transactionId: tx._id,
      invoiceNumber: tx.invoiceNumber,
      number,
      issuedAt,
      reason: req.body.reason,
      issuedBy: req.user.userId,
    });
    tx.voidedReason = req.body.reason;
    await reverseTimberSale(tx, req.user.userId, context);
    await creditNote.save({ session });
    compensate(() => CreditNote.deleteOne({ workspaceId, _id: creditNote._id }));
    const result = await Transaction.updateOne(
      { ...scope, status: "active" },
      {
        $set: {
          status: "voided",
          voidedAt: issuedAt,
          voidedBy: req.user.userId,
          voidedReason: req.body.reason,
          creditNoteId: creditNote._id,
        },
      },
      { session }
    );
    if (!result.matchedCount) fail(409, "Invoice is already voided");
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
      ? await CreditNote.findOne({ workspaceId: req.workspaceId, transactionId: tx._id })
      : undefined;
  if (req.query.kind === "credit_note" && !creditNote) fail(404, "Credit note not found");
  res
    .type("application/pdf")
    .set("Content-Disposition", `inline; filename="invoice-${tx._id}.pdf"`);
  if (tx.invoice.type === "tax_invoice") return pdf.streamTaxInvoice(res, tx, creditNote);
  pdf.streamTransactionReceipt(res, { businessName: req.timberWorkspace.businessName, tx });
}

module.exports = { list, get, quote, makeCreditNote, download };
