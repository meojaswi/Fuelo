import { useEffect, useState } from "react";
import { timberGet, timberSend, timberError } from "../api/timber.api";
import { formatCurrency } from "../utils/formatters";
import Input from "../components/shared/Input";
import Button from "../components/shared/Button";
import Pagination from "../components/shared/Pagination";
import { Select, ErrorNotice } from "../components/timber/TimberForms";

export default function TimberSuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [outstanding, setOutstanding] = useState(null);
  const [selected, setSelected] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  function refresh() {
    setRevision((value) => value + 1);
  }
  useEffect(() => {
    let active = true;
    timberGet("/suppliers")
      .then((result) => {
        if (active) setSuppliers(result.suppliers);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load suppliers."));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  async function checkPayables() {
    setChecking(true);
    try {
      setOutstanding((await timberGet("/suppliers/outstanding")).suppliers);
    } catch (err) {
      setError(timberError(err, "Could not load payables."));
    } finally {
      setChecking(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Suppliers</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" loading={checking} onClick={checkPayables}>
            Outstanding payables
          </Button>
          <Button type="button" onClick={() => setShowForm(true)}>
            Add supplier
          </Button>
        </div>
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      {showForm && (
        <SupplierEditor
          key="new"
          onCancel={() => setShowForm(false)}
          onSaved={(supplier) => {
            setShowForm(false);
            setSelected(supplier._id);
            setOutstanding(null);
            refresh();
          }}
        />
      )}
      {outstanding && (
        <div className="panel p-4">
          <h3 className="mb-2 font-bold">Outstanding payables</h3>
          {outstanding.length ? (
            outstanding.map((row) => (
              <p key={row._id}>
                {row.name} · {row.balance < 0 ? "Advance " : ""}
                {formatCurrency(Math.abs(row.balance))}
              </p>
            ))
          ) : (
            <p>No supplier balances.</p>
          )}
        </div>
      )}
      <Select
        label="Supplier ledger"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Choose a supplier</option>
        {suppliers.map((row) => (
          <option key={row._id} value={row._id}>
            {row.name}
            {row.isActive ? "" : " (inactive)"}
          </option>
        ))}
      </Select>
      {selected && (
        <SupplierLedger
          key={selected}
          id={selected}
          onChange={() => {
            setOutstanding(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function SupplierEditor({ supplier, onSaved, onCancel }) {
  const [draft, setDraft] = useState({
    name: supplier?.name ?? "",
    phone: supplier?.phone ?? "",
    gstin: supplier?.gstin ?? "",
    address: supplier?.address ?? "",
    state: supplier?.state ?? "",
    openingBalance: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { openingBalance, ...fields } = draft;
      const value = await timberSend(
        supplier ? "patch" : "post",
        supplier ? "/suppliers/" + supplier._id : "/suppliers",
        supplier ? fields : { ...fields, openingBalance: Number(openingBalance) }
      );
      onSaved(value);
    } catch (err) {
      setError(timberError(err, "Could not save supplier."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel space-y-4 p-5" onSubmit={submit}>
      <h3 className="font-bold">{supplier ? "Edit supplier" : "Add supplier"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["name", "Supplier name"],
          ["phone", "Phone"],
          ["gstin", "GSTIN"],
          ["address", "Address"],
          ["state", "State"],
        ].map(([key, label]) => (
          <Input
            key={key}
            label={label}
            required={key === "name"}
            inputMode={key === "phone" ? "tel" : undefined}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        ))}
        {!supplier && (
          <Input
            label="Opening payable"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={draft.openingBalance}
            onChange={(e) => setDraft({ ...draft, openingBalance: e.target.value })}
          />
        )}
      </div>
      <ErrorNotice>{error}</ErrorNotice>
      <div className="flex gap-2">
        <Button loading={busy}>Save supplier</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SupplierLedger({ id, onChange }) {
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [mode, setMode] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [advance, setAdvance] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const path = "/suppliers/" + id;
  useEffect(() => {
    let active = true;
    timberGet(path + "/ledger", { page })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load the supplier ledger."));
      });
    return () => {
      active = false;
    };
  }, [path, page, revision]);
  function refreshed() {
    setMode("");
    setAmount("");
    setAdvance(false);
    setReason("");
    setRevision((value) => value + 1);
    setPage(1);
    onChange();
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "deactivate") await timberSend("delete", path, { reason });
      else
        await timberSend("post", path + "/payments", {
          amount: Number(amount),
          paymentMode,
          advance,
        });
      refreshed();
    } catch (err) {
      setError(timberError(err, "Could not update supplier account."));
    } finally {
      setBusy(false);
    }
  }
  if (!result) return error ? <ErrorNotice>{error}</ErrorNotice> : <p>Loading ledger…</p>;
  const { supplier, entries, pages } = result;
  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-5">
        <h3 className="text-lg font-bold">{supplier.name}</h3>
        <p>
          {supplier.balance < 0 ? "Supplier advance" : "Payable"}{" "}
          <strong>{formatCurrency(Math.abs(supplier.balance))}</strong>
        </p>
        {supplier.isActive && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setMode("payment")}>
              Record supplier payment
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode("edit")}>
              Edit supplier
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("deactivate")}>
              Deactivate
            </Button>
          </div>
        )}
        {!supplier.isActive && supplier.balance > 0 && (
          <Button type="button" onClick={() => setMode("payment")}>
            Settle outstanding balance
          </Button>
        )}
      </div>
      {mode === "edit" && (
        <SupplierEditor supplier={supplier} onSaved={refreshed} onCancel={() => setMode("")} />
      )}
      {["payment", "deactivate"].includes(mode) && (
        <form className="panel space-y-3 p-5" onSubmit={submit}>
          {mode === "payment" ? (
            <>
              <Input
                label="Payment amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Select
                label="Payment mode"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </Select>
              {supplier.isActive && (
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={advance}
                    onChange={(e) => setAdvance(e.target.checked)}
                  />{" "}
                  Advance
                </label>
              )}
            </>
          ) : (
            <Input
              label="Deactivation reason"
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button loading={busy}>
              {mode === "payment" ? "Save payment" : "Confirm deactivation"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      <ErrorNotice>{error}</ErrorNotice>
      <ul className="panel divide-y">
        {entries.map((row) => (
          <li key={row._id} className="flex justify-between gap-4 p-3">
            <div>
              <p className="font-semibold capitalize">{row.type.replaceAll("_", " ")}</p>
              <p className="text-xs text-slate-600">{row.note}</p>
            </div>
            <div className="text-right">
              <p>
                {row.direction === "debit" ? "+" : "−"}
                {formatCurrency(row.amount)}
              </p>
              <p className="text-xs text-slate-600">Balance {formatCurrency(row.balanceAfter)}</p>
            </div>
          </li>
        ))}
        {!entries.length && <li className="p-3 text-sm">No ledger entries yet.</li>}
      </ul>
      <Pagination page={page} pages={pages} onChange={setPage} />
    </div>
  );
}
