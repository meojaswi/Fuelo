import { formatQuantity } from "../../utils/formatters";
export default function ItemStatRow({ item }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3.5 last:border-0">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-fuelo-coral" />
        <span className="text-sm font-semibold">{item.name}</span>
      </div>
      <span className="font-mono text-xs text-slate-400">
        {formatQuantity(item.quantity)} {item.unit || "units"}
      </span>
    </div>
  );
}
