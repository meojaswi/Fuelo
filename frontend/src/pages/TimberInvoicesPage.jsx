import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { timberGet, timberSend, timberError, downloadTimber } from "../api/timber.api";
import { useAuth } from "../hooks/useAuth";
import { formatCurrency, formatQuantity } from "../utils/formatters";
import { ErrorNotice } from "../components/timber/TimberForms";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Pagination from "../components/shared/Pagination";

export default function TimberInvoicesPage() {
  const { id } = useParams();
  return id ? <InvoiceDetail key={id} id={id} /> : <InvoiceList />;
}

function InvoiceList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    timberGet("/invoices", { page })
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load invoices."));
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold">Invoices</h2>
      <ErrorNotice>{error}</ErrorNotice>
      {!data && !error && <p className="text-sm text-slate-500">Loading invoices…</p>}
      {data && (
        <>
          <div className="panel divide-y">
            {data.invoices.map((row) => (
              <Link
                className="flex justify-between gap-3 p-4 hover:bg-slate-50"
                key={row._id}
                to={"/timber/invoices/" + row._id}
              >
                <span>
                  <strong>{row.invoiceNumber}</strong>
                  <span className="block text-sm text-slate-600">{row.customerName}</span>
                </span>
                <span className="text-right">
                  {formatCurrency(row.amount)}
                  {row.status === "voided" && <small className="block">Voided</small>}
                </span>
              </Link>
            ))}
            {!data.invoices.length && <p className="p-4">No timber invoices yet.</p>}
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

function InvoiceDetail({ id }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");
  const path = "/invoices/" + id;
  useEffect(() => {
    let active = true;
    timberGet(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load invoice."));
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  async function issue(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await timberSend("post", path + "/credit-note", { reason });
      setOpen(false);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(timberError(err, "Could not issue credit note."));
    } finally {
      setBusy(false);
    }
  }
  async function download(note) {
    if (downloading) return;
    setDownloading(note ? "note" : "invoice");
    setError("");
    try {
      await downloadTimber(
        path + "/pdf",
        (note ? "credit-note-" : "invoice-") + id + ".pdf",
        note ? { kind: "credit_note" } : {}
      );
    } catch (err) {
      setError(timberError(err, "Could not download PDF."));
    } finally {
      setDownloading("");
    }
  }
  if (!data) return error ? <ErrorNotice>{error}</ErrorNotice> : <p>Loading invoice…</p>;
  const { invoice, creditNote } = data;
  const tax = invoice.invoice.tax;
  return (
    <section className="space-y-5">
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-fuelo-coral"
        to="/timber/invoices"
      >
        Back to invoices
      </Link>
      <div className="panel space-y-4 p-5">
        <div>
          <p className="mono-label">{tax ? "Tax invoice" : "Bill of supply"}</p>
          <h2 className="mt-1 text-2xl font-bold">{invoice.invoiceNumber}</h2>
          <p>
            {invoice.customerName} · {invoice.customerPhone}
          </p>
          {invoice.invoice.recipient.gstin && <p>GSTIN {invoice.invoice.recipient.gstin}</p>}
          {invoice.invoice.recipient.address && <p>{invoice.invoice.recipient.address}</p>}
          {invoice.status === "voided" && (
            <p className="font-semibold">Voided · {invoice.voidedReason}</p>
          )}
        </div>
        <div className="divide-y text-sm">
          {invoice.lineItems.map((line, index) => (
            <div className="flex justify-between gap-3 py-2" key={index}>
              <div>
                {line.itemType} · {formatQuantity(line.quantity, 3)} {line.unit} · {line.pieces} pieces
                {line.hsnCode && <small className="block">HSN {line.hsnCode}</small>}
              </div>
              <span>{formatCurrency(line.lineAmount)}</span>
            </div>
          ))}
          {invoice.charges.map((line, index) => (
            <div className="flex justify-between py-2 capitalize" key={index}>
              {line.type}
              <span>{formatCurrency(line.amount)}</span>
            </div>
          ))}
        </div>
        {tax && (
          <div className="text-sm">
            <p>
              CGST {formatCurrency(tax.cgst)} · SGST {formatCurrency(tax.sgst)} · IGST{" "}
              {formatCurrency(tax.igst)}
            </p>
            <p>Round off {formatCurrency(tax.roundOff)}</p>
          </div>
        )}
        <p className="font-bold">Total {formatCurrency(invoice.amount)}</p>
        <p className="text-sm">
          Paid at sale {formatCurrency(invoice.paidAmount)} · Initial credit{" "}
          {formatCurrency(invoice.creditAmount)}
        </p>
        {invoice.advanceApplied > 0 && (
          <p className="text-sm">
            Customer credit applied {formatCurrency(invoice.advanceApplied)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            loading={downloading === "invoice"}
            disabled={Boolean(downloading)}
            onClick={() => download(false)}
          >
            Download invoice PDF
          </Button>
          {creditNote && (
            <Button
              type="button"
              variant="secondary"
              loading={downloading === "note"}
              disabled={Boolean(downloading)}
              onClick={() => download(true)}
            >
              Download credit note PDF
            </Button>
          )}
          {!creditNote &&
            tax &&
            invoice.status === "active" &&
            user?.permissions?.includes("invoices:credit_note") && (
              <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
                Issue credit note
              </Button>
            )}
        </div>
        {creditNote && (
          <p className="text-sm font-semibold">
            Credit note {creditNote.number} · {creditNote.reason}
          </p>
        )}
      </div>
      {open && (
        <form className="panel space-y-3 p-5" onSubmit={issue}>
          <Input
            label="Credit note reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            required
          />
          <div className="flex gap-2">
            <Button variant="danger" loading={busy}>
              Confirm credit note
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <ErrorNotice>{error}</ErrorNotice>
    </section>
  );
}
