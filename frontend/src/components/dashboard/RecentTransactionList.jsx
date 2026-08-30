import { ArrowUpRight } from "lucide-react";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { useNavigate } from "react-router-dom";
import EmptyState from "../shared/EmptyState";
export default function RecentTransactionList({ transactions = [] }) {
  const n = useNavigate();
  if (!transactions.length)
    return (
      <EmptyState title="No transactions today" description="New activity will appear here." />
    );
  return (
    <div className="panel divide-y divide-slate-100 overflow-hidden">
      {transactions.map((t) => (
        <button
          key={t._id || t.id}
          onClick={() => n(`/transactions/${t._id || t.id}`)}
          className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-slate-100 text-xs font-bold">
            {(t.customerName || "W")[0]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {t.customerName || "Walk-in customer"}
            </span>
            <span className="mt-1 block font-mono text-[10px] text-slate-400">
              {t.itemType || "Transaction"} ·{" "}
              {formatDate(t.createdAt || t.date, {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
          <span className="text-sm font-bold">{formatCurrency(t.amount)}</span>
          <ArrowUpRight size={15} className="text-slate-300" />
        </button>
      ))}
    </div>
  );
}
