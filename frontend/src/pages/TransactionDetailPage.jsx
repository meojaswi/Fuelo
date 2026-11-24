import { useAuth } from "../hooks/useAuth";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTransaction } from "../hooks/useTransactions";
import TransactionInfoCard from "../components/transactions/TransactionInfoCard";
import NotificationStatusCard from "../components/transactions/NotificationStatusCard";
import RetryButton from "../components/transactions/RetryButton";
import ShareLinkSection from "../components/transactions/ShareLinkSection";
import Modal from "../components/shared/Modal";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
import { getReceiptPdf, voidTransaction } from "../api/transactions.api";
import { formatCurrency } from "../utils/formatters";
import { retryNotification } from "../api/notifications.api";
export default function TransactionDetailPage() {
  const { user } = useAuth();
  const can = (permission) => user?.permissions?.includes(permission);
  const { id } = useParams(),
    { transaction: t, loading, notFound, reload } = useTransaction(id),
    [busy, setBusy] = useState(false),
    [pdfError, setPdfError] = useState("");
  const [voided, setVoided] = useState(null);
  const [showVoid, setShowVoid] = useState(false);
  const [reason, setReason] = useState("");
  const [voidError, setVoidError] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const status = voided?._id === id ? voided : t;
  if (loading)
    return <div className="py-16 text-center text-sm text-slate-400">Loading transaction…</div>;
  if (!t && notFound)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-slate-600">
          Transaction not found. It may have been removed, or the link is wrong.
        </p>
        <Link className="inline-flex min-h-11 items-center font-semibold text-fuelo-coral" to="/transactions">
          Back to transactions
        </Link>
      </div>
    );
  if (!t)
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-600">
          Could not load this transaction. Check your connection and try again.
        </p>
        <Button type="button" variant="secondary" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  async function confirmVoid(event) {
    event.preventDefault();
    setVoiding(true);
    setVoidError("");
    try {
      setVoided(await voidTransaction(id, reason));
      setShowVoid(false);
      setReason("");
    } catch (err) {
      setVoidError(err.response?.data?.error || "Could not void this transaction.");
    } finally {
      setVoiding(false);
    }
  }
  async function downloadReceipt() {
    if (downloading) return;
    setDownloading(true);
    setPdfError("");
    try {
      const url = URL.createObjectURL(await getReceiptPdf(id));
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setPdfError("Could not download the receipt.");
    } finally {
      setDownloading(false);
    }
  }
  async function retry() {
    setBusy(true);
    try {
      await retryNotification(t.notificationId);
      location.reload();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="mono-label">Transaction / Detail</p>
        <h2 className="mt-2 text-2xl font-bold">{t.customerName || "Transaction"}</h2>
        <p className="mt-1 text-sm text-slate-500">Full record and customer delivery status.</p>
      </div>
      {status.status === "voided" && (
        <p className="rounded-lg bg-slate-100 p-4 text-sm font-semibold">
          Voided · {status.voidedReason}
        </p>
      )}
      <TransactionInfoCard transaction={t} />
      {t.invoiceNumber && (
        <div className="panel space-y-2 p-4 text-sm">
          <p className="font-semibold">Invoice {t.invoiceNumber}</p>
          {t.lineItems?.map((line, index) => (
            <p key={index}>
              {line.itemType} · {line.quantity} {line.unit} · {line.pieces} pieces ·{" "}
              {formatCurrency(line.lineAmount)}
            </p>
          ))}
          <p>
            Paid at sale {formatCurrency(t.paidAmount)} · Initial credit{" "}
            {formatCurrency(t.creditAmount)}
          </p>
          {t.advanceApplied > 0 && (
            <p>Customer credit applied {formatCurrency(t.advanceApplied)}</p>
          )}
          {can("invoices:read") && (
            <Link
              to={"/timber/invoices/" + id}
              className="inline-flex min-h-11 items-center font-semibold text-fuelo-coral"
            >
              Open invoice
            </Link>
          )}
        </div>
      )}
      {t.vehicleNumber && (
        <p className="text-sm text-slate-500">
          Vehicle {t.vehicleNumber}
          {t.vehicleNumberWarning && " · Unusual registration format"}
        </p>
      )}
      {t.recordedBy && <p className="text-sm text-slate-500">Recorded by {t.recordedBy}</p>}
      {t.priceMismatch && (
        <p className="text-sm text-amber-700">
          Amount differs from list price ({formatCurrency(t.expectedAmount)}).
        </p>
      )}
      {t.customerId && can("credit:read") && (
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-fuelo-coral"
          to={`/credit/${t.customerId}`}
        >
          View customer ledger
        </Link>
      )}
      {can("notifications:manage") && (
        <div className="grid gap-5 sm:grid-cols-2">
          <NotificationStatusCard status={t.notificationStatus} />
          <div className="panel p-5">
            <p className="mono-label">Delivery action</p>
            <h3 className="mt-1 font-bold">Message delivery</h3>
            <div className="mt-4">
              <RetryButton
                visible={t.notificationStatus === "failed"}
                onRetry={retry}
                loading={busy}
              />
            </div>
          </div>
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        loading={downloading}
        onClick={downloadReceipt}
        className="text-fuelo-coral"
      >
        Download PDF receipt
      </Button>
      {pdfError && <p role="alert">{pdfError}</p>}
      <ShareLinkSection transactionId={id} />
      {status.status === "active" &&
        t.invoice?.type === "tax_invoice" &&
        can("invoices:credit_note") && (
          <Link
            to={"/timber/invoices/" + id}
            className="flex min-h-11 items-center text-sm font-semibold text-fuelo-coral"
          >
            Manage credit note in invoice
          </Link>
        )}
      {status.status === "active" &&
        t.invoice?.type !== "tax_invoice" &&
        can("transactions:void") && (
          <Button type="button" variant="secondary" onClick={() => setShowVoid(true)}>
            Void transaction
          </Button>
        )}
      <Modal
        open={showVoid}
        onClose={() => !voiding && setShowVoid(false)}
        title="Void transaction"
      >
        <form onSubmit={confirmVoid} className="space-y-4">
          <Input
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={3}
            maxLength={500}
            required
          />
          {voidError && (
            <p role="alert" className="text-sm text-red-600">
              {voidError}
            </p>
          )}
          <Button variant="danger" loading={voiding}>
            Confirm void
          </Button>
        </form>
      </Modal>
    </div>
  );
}
