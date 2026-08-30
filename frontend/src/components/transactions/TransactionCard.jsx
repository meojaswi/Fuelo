import { useNavigate } from "react-router-dom";
import { formatCurrency, formatDate } from "../../utils/formatters";
export default function TransactionCard({ transaction: t }) {
  const n = useNavigate();
  return (
    <button
      onClick={() => n(`/transactions/${t._id || t.id}`)}
      className="panel flex w-full items-center gap-3 p-4 text-left hover:border-slate-300"
    >
      <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-slate-100 text-xs font-bold">
        {(t.customerName || "W")[0]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{t.customerName || "Walk-in"}</span>
        <span className="font-mono text-[10px] text-slate-400">
          {t.itemType} · {formatDate(t.createdAt || t.date, { day: "2-digit", month: "short" })}
        </span>
      </span>
      <span className="text-sm font-bold">{formatCurrency(t.amount)}</span>
    </button>
  );
}
