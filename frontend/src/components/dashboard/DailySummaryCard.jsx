import { formatCurrency, formatQuantity } from "../../utils/formatters";
export default function DailySummaryCard({ summary }) {
  const sales = summary?.sales ?? summary?.revenue ?? 0;
  return (
    <section className="relative overflow-hidden rounded-[8px] bg-fuelo-surface p-6 text-white shadow-panel md:p-7">
      <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10" />
      <div className="absolute right-12 bottom-0 h-24 w-24 rounded-full bg-fuelo-coral/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="mono-label text-white/40">Daily ledger / Today</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Your day at a glance.</h2>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] text-white/50">
            LIVE
          </span>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Metric label="Opening stock" value={formatQuantity(summary?.openingStock)} />
          <Metric label="Dispensed / sold" value={formatQuantity(summary?.sold)} />
          <Metric label="Today's sales" value={formatCurrency(sales)} />
        </div>
      </div>
    </section>
  );
}
function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
