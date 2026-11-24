import { useEffect, useState } from "react";
import { timberGet, timberSend, timberError } from "../../api/timber.api";
import { autocompleteCustomers } from "../../api/customers.api";
import { createTransaction } from "../../api/transactions.api";
import { useAuth } from "../../hooks/useAuth";
import { formatCurrency } from "../../utils/formatters";
import Button from "../shared/Button";
import Input from "../shared/Input";
import { LineEditor, ChargeEditor, Select, ErrorNotice } from "./TimberForms";
import { linePreview, payloadLines, payloadCharges } from "./timberFormValues";

export default function TimberSaleForm({ onSaved }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [lines, setLines] = useState([]);
  const [charges, setCharges] = useState([]);
  const [buyer, setBuyer] = useState({
    customerName: "",
    customerPhone: "",
    customerGstin: "",
    billingAddress: "",
    customerState: "",
  });
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [matches, setMatches] = useState([]);
  const [mode, setMode] = useState("cash");
  const [paid, setPaid] = useState("");
  const [override, setOverride] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const registered = user?.taxRegistered;
  useEffect(() => {
    let active = true;
    timberGet("/timber/items")
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((err) => {
        if (active) setError(timberError(err, "Could not load timber items."));
      });
    return () => {
      active = false;
    };
  }, []);
  const data = {
    ...Object.fromEntries(Object.entries(buyer).filter(([, value]) => value !== "")),
    ...(placeOfSupply && { placeOfSupply }),
    customerPhone: /^\d{10}$/.test(buyer.customerPhone)
      ? "+91" + buyer.customerPhone
      : buyer.customerPhone,
    paymentMode: mode,
    ...(mode !== "credit" && paid !== "" && { paidAmount: Number(paid) }),
    lineItems: payloadLines(lines),
    charges: payloadCharges(charges),
    override,
  };
  const key = JSON.stringify(data);
  const readyForQuote = Boolean(
    buyer.customerName &&
      buyer.customerPhone.length >= 10 &&
      lines.length &&
      lines.every(
        (line) =>
          items &&
          linePreview(
            line,
            items.find((item) => item.itemType === line.itemType)
          ).quantity > 0
      )
  );
  useEffect(() => {
    if (!registered || !readyForQuote) return;
    let active = true;
    const timer = setTimeout(() => {
      timberSend("post", "/timber/sale-quote", JSON.parse(key))
        .then((result) => {
          if (active) setQuote({ key, result });
        })
        .catch((err) => {
          if (active) setQuote({ key, error: timberError(err, "Could not calculate GST.") });
        });
    }, 240);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, readyForQuote, registered]);
  const current = quote?.key === key ? quote : null;
  const subtotal =
    (items
      ? lines.reduce(
          (sum, line) =>
            sum +
            (linePreview(
              line,
              items.find((row) => row.itemType === line.itemType)
            ).amount || 0),
          0
        )
      : 0) + charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
  const total = current?.result?.amount ?? subtotal;
  const tax = current?.result?.tax;
  const due = mode === "credit" ? total : Math.max(0, total - Number(paid === "" ? total : paid));
  function editBuyer(key, value) {
    setBuyer({ ...buyer, [key]: value });
  }
  async function lookup() {
    setError("");
    try {
      const { customers } = await autocompleteCustomers(buyer.customerName);
      setMatches(customers);
      if (!customers.length) setError("No saved customers match that name.");
    } catch (err) {
      setError(timberError(err, "Could not look up customers."));
    }
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await createTransaction(data));
    } catch (err) {
      setError(timberError(err, "Could not record timber sale."));
    } finally {
      setBusy(false);
    }
  }
  if (!items) return error ? <ErrorNotice>{error}</ErrorNotice> : <p>Loading timber items…</p>;
  return (
    <form className="space-y-5" onSubmit={submit}>
      {!items.some((item) => item.pricingUnit) && (
        <p>Configure a timber item in Inventory before recording a sale.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Customer name"
          required
          value={buyer.customerName}
          onChange={(e) => editBuyer("customerName", e.target.value)}
        />
        <Input
          label="Customer phone"
          inputMode="tel"
          type="tel"
          minLength={10}
          maxLength={15}
          required
          value={buyer.customerPhone}
          onChange={(e) => editBuyer("customerPhone", e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={!buyer.customerName.trim()}
        onClick={lookup}
      >
        Find saved customer
      </Button>
      {matches.length > 0 && (
        <Select
          label="Saved customer"
          value=""
          onChange={(e) => {
            const row = matches.find((match) => match._id === e.target.value);
            if (!row) return;
            setBuyer({
              customerName: row.name,
              customerPhone: row.phone,
              customerGstin: row.gstin ?? "",
              billingAddress: row.billingAddress ?? "",
              customerState: row.state ?? "",
            });
            setMatches([]);
          }}
        >
          <option value="">Choose a customer</option>
          {matches.map((row) => (
            <option key={row._id} value={row._id}>
              {row.name} · {row.phone}
            </option>
          ))}
        </Select>
      )}
      {registered && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Customer GSTIN"
            maxLength={15}
            value={buyer.customerGstin}
            onChange={(e) => editBuyer("customerGstin", e.target.value.toUpperCase())}
          />
          <Input
            label="Billing address"
            value={buyer.billingAddress}
            onChange={(e) => editBuyer("billingAddress", e.target.value)}
          />
          <Input
            label="Customer state code"
            maxLength={2}
            value={buyer.customerState}
            onChange={(e) => editBuyer("customerState", e.target.value)}
          />
          <Input
            label="Place of supply state code"
            maxLength={2}
            placeholder="Defaults to customer or seller state"
            value={placeOfSupply}
            onChange={(e) => setPlaceOfSupply(e.target.value)}
          />
        </div>
      )}
      <LineEditor lines={lines} setLines={setLines} items={items} />
      <ChargeEditor charges={charges} setCharges={setCharges} tax={registered} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="credit">Credit</option>
        </Select>
        {mode !== "credit" && (
          <Input
            label="Paid now (blank for full payment)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
          />
        )}
      </div>
      {user?.permissions?.includes("credit:payment") && due > 0 && (
        <label className="text-sm">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
          />{" "}
          Override customer credit limit
        </label>
      )}
      <div className="rounded-lg bg-slate-50 p-4 text-sm" aria-live="polite">
        {tax && (
          <>
            <p>Taxable value {formatCurrency(tax.taxableValue)}</p>
            <p>
              CGST {formatCurrency(tax.cgst)} · SGST {formatCurrency(tax.sgst)} · IGST{" "}
              {formatCurrency(tax.igst)}
            </p>
            <p>Round off {formatCurrency(tax.roundOff)}</p>
          </>
        )}
        <p className="font-bold">
          {registered && !tax ? "Before GST quote" : "Total"} {formatCurrency(total)}
        </p>
        <p>Due from this sale {formatCurrency(due)}</p>
      </div>
      <ErrorNotice>{error || current?.error}</ErrorNotice>
      <Button loading={busy} disabled={!lines.length || (registered && !tax)}>
        Record timber sale
      </Button>
    </form>
  );
}
