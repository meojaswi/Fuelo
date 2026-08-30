import { formatCurrency, formatDate, formatQuantity } from "../../utils/formatters";
export default function TransactionInfoCard({ transaction: t }) {
  const rows = [
    ["Customer", t.customerName],
    ["Item", t.itemType],
    ["Quantity", formatQuantity(t.quantity)],
    ["Amount", formatCurrency(t.amount)],
    ["Payment", t.paymentMode],
    ["Date", formatDate(t.createdAt || t.date, { dateStyle: "medium", timeStyle: "short" })],
  ];
  return (
    <div className="panel p-5 md:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {rows.map(([a, b]) => (
          <div key={a}>
            <p className="mono-label">{a}</p>
            <p className="mt-1.5 text-sm font-semibold">{b || "—"}</p>
          </div>
        ))}
      </div>
      {t.notes && (
        <div className="mt-6 border-t pt-5">
          <p className="mono-label">Notes</p>
          <p className="mt-1 text-sm text-slate-600">{t.notes}</p>
        </div>
      )}
    </div>
  );
}
