import { useEffect, useState } from "react";
import CustomerNameInput from "./CustomerNameInput";
import ItemTypeSelector from "./ItemTypeSelector";
import QuantityInput from "./QuantityInput";
import AmountInput from "./AmountInput";
import PaymentModeSelector from "./PaymentModeSelector";
import UpiReferenceInput from "./UpiReferenceInput";
import NotesInput from "./NotesInput";
import MessagePreviewModal from "./MessagePreviewModal";
import Button from "../shared/Button";
import PhoneInput from "../shared/PhoneInput";
import Input from "../shared/Input";
import { useAuth } from "../../hooks/useAuth";
import { fetchPrices } from "../../api/inventory.api";
import { formatCurrency } from "../../utils/formatters";
import { createTransaction } from "../../api/transactions.api";
export default function TransactionForm({ onSaved }) {
  const { user } = useAuth();
  const options =
    user?.config?.itemTypes ?? (user?.verticalType === "fuel" ? ["Diesel", "Petrol", "CNG"] : []);
  const [f, setF] = useState({
    customerName: "",
    customerPhone: "",
    itemType: options[0] || "",
    unit:
      user?.config?.itemUnits?.[options[0]] ??
      user?.verticalLabels?.unit ??
      (user?.verticalType === "fuel" ? "litres" : ""),
    quantity: "",
    amount: null,
    paymentMode: "Cash",
    upiReference: "",
    notes: "",
    vehicleNumber: "",
  });
  const [preview, setPreview] = useState(false),
    [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [override, setOverride] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const vehicles = selectedCustomer?.isCreditCustomer ? (selectedCustomer.vehicles ?? []) : [];
  const workspaceId = user?.workspaceId;
  const [inventoryResult, setInventoryResult] = useState(null);
  useEffect(() => {
    let active = true;
    fetchPrices()
      .then((items) => {
        if (active) setInventoryResult({ workspaceId, items });
      })
      .catch(() => {
        if (active) setInventoryResult({ workspaceId, items: [] });
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  const inventory =
    inventoryResult?.workspaceId === workspaceId
      ? inventoryResult?.items.find((item) => item.itemType === f.itemType)
      : undefined;
  const expectedAmount =
    inventory && Number(f.quantity) > 0
      ? Math.round(Number((Number(f.quantity) * inventory.pricePerUnit).toPrecision(15)) * 100) /
        100
      : null;
  const amount = f.amount ?? (expectedAmount > 0 ? expectedAmount.toFixed(2) : "");
  const unit = inventory?.unit ?? f.unit;
  const priceMismatch =
    expectedAmount !== null &&
    amount !== "" &&
    Math.round(Math.abs(Number(amount) - expectedAmount) * 100) > 100;
  const u = (key, value) => {
    setF((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "itemType" && {
        unit: user?.config?.itemUnits?.[value] ?? user?.verticalLabels?.unit ?? previous.unit,
      }),
    }));
    if (["customerName", "customerPhone"].includes(key)) setSelectedCustomer(null);
    setOverride(false);
    setSaveError(null);
  };
  async function submit(e) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const d = await createTransaction({
        ...f,
        customerPhone: `+91${f.customerPhone}`,
        paymentMode: f.paymentMode.toLowerCase(),
        quantity: Number(f.quantity),
        amount: Number(amount),
        unit,
        override:
          f.paymentMode === "Credit" && override && user?.permissions?.includes("credit:payment"),
      });
      onSaved?.(d);
    } catch (e) {
      setSaveError({
        message: e.response?.data?.error || "Could not save transaction.",
        creditLimit: e.response?.data?.code === "CREDIT_LIMIT_EXCEEDED",
      });
    } finally {
      setSaving(false);
    }
  }
  const msg = `Hi ${f.customerName || "Customer"}, your ${f.itemType} transaction of ${formatCurrency(Number(amount || 0))} has been recorded. Payment: ${f.paymentMode}. Thank you.`;
  return (
    <form onSubmit={submit} className="space-y-6">
      <CustomerNameInput
        value={f.customerName}
        onChange={(v) => u("customerName", v)}
        onSelect={(customer) => {
          setSelectedCustomer(customer);
          const phone = customer.phone.replace(/^\+91(?=\d{10}$)/, "");
          setF((previous) => ({
            ...previous,
            customerName: customer.name,
            customerPhone: /^\d{10}$/.test(phone) ? phone : previous.customerPhone,
            vehicleNumber: "",
          }));
          setOverride(false);
          setSaveError(null);
        }}
      />
      <PhoneInput
        value={f.customerPhone}
        onChange={(e) => u("customerPhone", e.target.value)}
        type="tel"
        pattern="[0-9]{10}"
        required
      />
      {options.length ? (
        <ItemTypeSelector options={options} value={f.itemType} onChange={(v) => u("itemType", v)} />
      ) : (
        <Input
          label="Item type"
          value={f.itemType}
          onChange={(e) => u("itemType", e.target.value)}
          required
        />
      )}
      <Input
        label="Unit"
        value={unit}
        readOnly={Boolean(inventory)}
        onChange={(e) => u("unit", e.target.value)}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <QuantityInput
          unit={unit || "units"}
          value={f.quantity}
          onChange={(v) => u("quantity", v)}
        />
        <div>
          <AmountInput value={amount} onChange={(v) => u("amount", v)} />
          {priceMismatch && (
            <p className="mt-1 text-xs text-amber-700">
              Amount differs from list price ({formatCurrency(expectedAmount)}).
            </p>
          )}
          {f.amount !== null && expectedAmount > 0 && (
            <button
              type="button"
              className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-fuelo-coral"
              onClick={() => u("amount", null)}
            >
              Use list price
            </button>
          )}
        </div>
      </div>
      <PaymentModeSelector value={f.paymentMode} onChange={(v) => u("paymentMode", v)} />
      {saveError && (
        <p role="alert" className="text-sm text-red-600">
          {saveError.message}
        </p>
      )}
      {f.paymentMode === "Credit" &&
        saveError?.creditLimit &&
        user?.permissions?.includes("credit:payment") && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Allow this sale to exceed the credit limit
          </label>
        )}
      {user?.verticalFeatures?.vehicleNumber && (
        <div className="space-y-2">
          {f.paymentMode === "Credit" && vehicles.length > 0 && (
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Fleet vehicle</span>
              <select
                className="control min-h-11 w-full px-3 py-2"
                value={
                  vehicles.some((vehicle) => vehicle.number === f.vehicleNumber)
                    ? f.vehicleNumber
                    : ""
                }
                onChange={(e) => u("vehicleNumber", e.target.value)}
              >
                <option value="">Enter a vehicle number</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.number} value={vehicle.number}>
                    {vehicle.number}
                    {vehicle.label ? ` · ${vehicle.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Input
            label="Vehicle number"
            value={f.vehicleNumber}
            onChange={(e) => u("vehicleNumber", e.target.value)}
            maxLength={32}
          />
        </div>
      )}
      <UpiReferenceInput
        visible={f.paymentMode === "UPI"}
        value={f.upiReference}
        onChange={(v) => u("upiReference", v)}
      />
      <NotesInput value={f.notes} onChange={(v) => u("notes", v)} />
      <div className="flex items-center justify-between border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={() => setPreview(true)}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          Preview message
        </button>
        <Button loading={saving} className="min-w-40">
          Save transaction
        </Button>
      </div>
      <MessagePreviewModal open={preview} onClose={() => setPreview(false)} message={msg} />
    </form>
  );
}
