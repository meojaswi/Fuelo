import { useEffect, useState } from "react";
import { timberGet, timberSend, timberError } from "../api/timber.api";
import { formatCurrency, formatQuantity } from "../utils/formatters";
import { useAuth } from "../hooks/useAuth";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Pagination from "../components/shared/Pagination";
import { ChargeEditor, ErrorNotice, LineEditor, Select } from "../components/timber/TimberForms";
import { linePreview, payloadCharges, payloadLines } from "../components/timber/timberFormValues";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default function TimberPurchasesPage() {
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const canCreate = user?.permissions?.includes("purchases:create");
  useEffect(() => {
    let active = true;
    timberGet("/purchases", { page })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load purchases."));
      });
    return () => {
      active = false;
    };
  }, [page, revision]);
  function updated() {
    setEditing(false);
    setPage(1);
    setRevision((value) => value + 1);
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Purchases</h2>
        {canCreate && (
          <Button type="button" onClick={() => setEditing((value) => !value)}>
            {editing ? "Close purchase form" : "Add purchase"}
          </Button>
        )}
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      {editing && <PurchaseEditor onSaved={updated} />}
      <div className="space-y-3">
        {(result?.purchases ?? []).map((purchase) => (
          <PurchaseCard
            key={purchase._id}
            record={purchase}
            canCreate={canCreate}
            onUpdated={updated}
          />
        ))}
        {!result && !error && <p className="text-sm text-slate-500">Loading purchases…</p>}
        {result && !result.purchases.length && <p>No purchases recorded.</p>}
        {result && <Pagination page={page} pages={result.pages} onChange={setPage} />}
      </div>
    </section>
  );
}

function PurchaseEditor({ onSaved }) {
  const [options, setOptions] = useState(null);
  const [draft, setDraft] = useState({
    supplierId: "",
    invoiceNumber: "",
    invoiceDate: today(),
    paidAmount: "",
    paymentMode: "cash",
    notes: "",
  });
  const [lines, setLines] = useState([]);
  const [charges, setCharges] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([timberGet("/suppliers", { active: true }), timberGet("/timber/items")])
      .then(([suppliers, items]) => {
        if (active) setOptions({ ...suppliers, ...items });
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load suppliers and items."));
      });
    return () => {
      active = false;
    };
  }, []);
  function field(key, value) {
    setDraft({ ...draft, [key]: value });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await timberSend("post", "/purchases", {
        ...draft,
        paidAmount: Number(draft.paidAmount),
        lineItems: payloadLines(lines),
        charges: payloadCharges(charges),
      });
      onSaved();
    } catch (err) {
      setError(timberError(err, "Could not record purchase."));
    } finally {
      setBusy(false);
    }
  }
  if (!options) return error ? <ErrorNotice>{error}</ErrorNotice> : <p>Loading purchase form…</p>;
  const total =
    lines.reduce(
      (sum, line) =>
        sum +
        (linePreview(
          line,
          options.items.find((item) => item.itemType === line.itemType)
        ).amount || 0),
      0
    ) + charges.reduce((sum, line) => sum + Number(line.amount), 0);
  return (
    <form className="panel space-y-5 p-5" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Supplier"
          required
          value={draft.supplierId}
          onChange={(e) => field("supplierId", e.target.value)}
        >
          <option value="">Select supplier</option>
          {options.suppliers.map((row) => (
            <option value={row._id} key={row._id}>
              {row.name}
            </option>
          ))}
        </Select>
        <Input
          label="Supplier invoice number"
          required
          value={draft.invoiceNumber}
          onChange={(e) => field("invoiceNumber", e.target.value)}
        />
        <Input
          label="Invoice date"
          type="date"
          required
          value={draft.invoiceDate}
          onChange={(e) => field("invoiceDate", e.target.value)}
        />
        <Input label="Notes" value={draft.notes} onChange={(e) => field("notes", e.target.value)} />
      </div>
      <LineEditor lines={lines} setLines={setLines} items={options.items} purchase />
      <ChargeEditor charges={charges} setCharges={setCharges} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Amount paid"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={draft.paidAmount}
          onChange={(e) => field("paidAmount", e.target.value)}
        />
        <Select
          label="Payment mode"
          value={draft.paymentMode}
          onChange={(e) => field("paymentMode", e.target.value)}
        >
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
        </Select>
      </div>
      <p className="font-bold">Purchase total {formatCurrency(total)}</p>
      <ErrorNotice>{error}</ErrorNotice>
      <Button loading={busy} disabled={!lines.length}>
        Save purchase
      </Button>
    </form>
  );
}

function PurchaseCard({ record, canCreate, onUpdated }) {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await timberSend("post", "/purchases/" + record._id + "/void", { reason });
      setVoiding(false);
      onUpdated();
    } catch (err) {
      setError(timberError(err, "Could not void purchase."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel p-4">
      <summary className="cursor-pointer py-3 font-semibold">
        {record.invoiceNumber} · {record.supplierName} · {formatCurrency(record.total)}
        {record.status === "voided" && " · Voided"}
      </summary>
      <div className="mt-3 space-y-2 text-sm">
        <p>
          {record.invoiceDate} · Paid {formatCurrency(record.paidAmount)}
        </p>
        {record.lineItems.map((line, index) => (
          <p key={index}>
            {line.itemType} · {formatQuantity(line.quantity, 3)} {line.unit} · {line.pieces} pieces
          </p>
        ))}
        {canCreate && record.status === "active" && (
          <Button type="button" variant="secondary" onClick={() => setVoiding(true)}>
            Void purchase
          </Button>
        )}
        {voiding && (
          <form className="space-y-2" onSubmit={submit}>
            <Input
              label="Void reason"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button loading={busy} variant="danger">
              Confirm purchase void
            </Button>
          </form>
        )}
        <ErrorNotice>{error}</ErrorNotice>
      </div>
    </details>
  );
}
