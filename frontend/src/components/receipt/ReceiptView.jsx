import { formatCurrency, formatDate, formatQuantity } from "../../utils/formatters";
export default function ReceiptView({ transaction: t }) {
  return (
    <div className="mx-auto max-w-md rounded-[8px] bg-white p-7 shadow-panel">
      <div className="border-b border-slate-100 pb-6 text-center">
        <div className="text-xl font-black">
          fuelo<span className="text-fuelo-coral">.</span>
        </div>
        <p className="mono-label mt-2">Customer receipt</p>
      </div>
      <div className="space-y-4 py-6 text-sm">
        <Row a="Customer" b={t.customerName} />
        <Row a="Item" b={t.itemType} />
        <Row a="Quantity" b={formatQuantity(t.quantity)} />
        <Row a="Payment" b={t.paymentMode} />
        <Row
          a="Date"
          b={formatDate(t.createdAt || t.date, { dateStyle: "medium", timeStyle: "short" })}
        />
      </div>
      <div className="border-t pt-6 text-center">
        <p className="mono-label">Total paid</p>
        <p className="mt-2 text-3xl font-black">{formatCurrency(t.amount)}</p>
      </div>
    </div>
  );
}
function Row({ a, b }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-400">{a}</span>
      <span className="font-semibold">{b || "—"}</span>
    </div>
  );
}
