import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCustomer,
  getCustomerLedger,
  getOutstanding,
  recordCustomerPayment,
} from "../api/customers.api";
import Button from "../components/shared/Button";
import EmptyState from "../components/shared/EmptyState";
import Input from "../components/shared/Input";
import Modal from "../components/shared/Modal";
import Pagination from "../components/shared/Pagination";
import Textarea from "../components/shared/Textarea";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate } from "../utils/formatters";

const dateOptions = { dateStyle: "medium", timeZone: "Asia/Kolkata" };
const labels = {
  credit_sale: "Credit sale",
  payment: "Payment received",
  adjustment: "Adjustment",
  void_reversal: "Sale void",
};

export default function CreditPage() {
  const { user } = useAuth();
  const { id } = useParams();
  return id ? (
    <CustomerLedger key={`${user?.workspaceId}/${id}`} id={id} />
  ) : (
    <Outstanding key={user?.workspaceId} />
  );
}

function Outstanding() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getOutstanding()
      .then((data) => {
        if (active) setResult(data);
      })
      .catch(() => {
        if (active) setError("Could not load outstanding balances.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-6">
      <header>
        <p className="mono-label">Customer accounts</p>
        <h2 className="mt-2 text-2xl font-bold">Credit / Udhaar</h2>
      </header>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {!result && !error && <p className="text-sm text-slate-500">Loading balances…</p>}
      {result && (
        <>
          <div className="rounded-lg bg-fuelo-ink p-6 text-white">
            <p className="text-sm text-slate-300">Total outstanding</p>
            <p className="mt-2 text-3xl font-bold">{formatCurrency(result.totalOutstanding)}</p>
          </div>
          {result.customers.length ? (
            <ul className="panel divide-y divide-slate-100">
              {result.customers.map((customer) => (
                <li key={customer._id}>
                  <Link
                    to={`/credit/${customer._id}`}
                    className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold">{customer.name}</p>
                      <p className="text-xs text-slate-500">{customer.phone}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {customer.lastPaymentAt
                          ? `Last payment ${formatDate(customer.lastPaymentAt, dateOptions)}`
                          : "No payments recorded"}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold">
                      {formatCurrency(customer.creditBalance)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No outstanding balances"
              description="Credit sales appear here while the customer owes a balance."
            />
          )}
        </>
      )}
    </section>
  );
}

function CustomerLedger({ id }) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getCustomer(id), getCustomerLedger(id, page)])
      .then(([customer, ledger]) => {
        if (active) setResult({ customer, ledger, page, revision });
      })
      .catch(() => {
        if (active) setResult({ error: "Could not load this customer account.", page, revision });
      });
    return () => {
      active = false;
    };
  }, [id, page, revision]);

  const current = result?.page === page && result.revision === revision ? result : null;
  const customer = current?.customer;
  const ledger = current?.ledger;
  const balance = customer?.creditBalance ?? 0;
  return (
    <section className="space-y-6">
      <Link className="text-sm font-semibold text-fuelo-coral" to="/credit">
        Back to Credit / Udhaar
      </Link>
      {!current && <p className="text-sm text-slate-500">Loading ledger…</p>}
      {current?.error && (
        <p role="alert" className="text-sm text-red-600">
          {current.error}
        </p>
      )}
      {customer && (
        <>
          <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="mono-label">Customer account</p>
              <h2 className="mt-2 text-2xl font-bold">{customer.name}</h2>
              <p className="text-sm text-slate-500">{customer.phone}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">
                {balance < 0 ? "Customer credit" : "Outstanding"}
              </p>
              <p className="text-xl font-bold">{formatCurrency(Math.abs(balance))}</p>
            </div>
            {balance > 0 && (
              <Button type="button" onClick={() => setShowPayment(true)}>
                Record payment
              </Button>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-bold">Ledger</h3>
            {ledger.entries.length ? (
              <ul className="panel divide-y divide-slate-100">
                {ledger.entries.map((entry) => (
                  <li key={entry._id} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{labels[entry.type]}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(entry.createdAt, dateOptions)}
                        {entry.paymentMode && ` · ${entry.paymentMode.toUpperCase()}`}
                      </p>
                      {entry.note && (
                        <p className="mt-1 break-words text-sm text-slate-600">{entry.note}</p>
                      )}
                      {entry.transactionId && (
                        <Link
                          className="text-xs text-fuelo-coral"
                          to={`/transactions/${entry.transactionId}`}
                        >
                          View transaction
                        </Link>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">
                        {entry.direction === "debit" ? "+" : "−"}
                        {formatCurrency(entry.amount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Balance {formatCurrency(entry.balanceAfter)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No ledger entries"
                description="Sales and payments will appear here."
              />
            )}
            <Pagination page={page} pages={ledger.pages} onChange={setPage} />
          </div>
          {showPayment && (
            <PaymentModal
              id={id}
              balance={balance}
              onClose={() => setShowPayment(false)}
              onSaved={() => {
                setShowPayment(false);
                setPage(1);
                setRevision((value) => value + 1);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function PaymentModal({ id, balance, onClose, onSaved }) {
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [upiReference, setUpiReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await recordCustomerPayment(id, {
        amount: Number(amount),
        paymentMode,
        upiReference: paymentMode === "upi" ? upiReference : undefined,
        note,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || "Could not record the payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={() => !saving && onClose()} title="Record payment">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">Outstanding {formatCurrency(balance)}</p>
        <Input
          label="Amount"
          type="number"
          min="0.01"
          max={balance}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Payment mode</span>
          <select
            className="control w-full px-3 py-2"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value)}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
          </select>
        </label>
        {paymentMode === "upi" && (
          <Input
            label="UPI reference"
            maxLength={128}
            value={upiReference}
            onChange={(e) => setUpiReference(e.target.value)}
          />
        )}
        <Textarea
          label="Note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button loading={saving}>Save payment</Button>
      </form>
    </Modal>
  );
}
