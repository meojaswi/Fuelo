import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useDailySummary } from "../hooks/useDailySummary";
import { useTransactions } from "../hooks/useTransactions";
import DailySummaryCard from "../components/dashboard/DailySummaryCard";
import ItemStatRow from "../components/dashboard/ItemStatRow";
import NotificationBanner from "../components/dashboard/NotificationBanner";
import RecentTransactionList from "../components/dashboard/RecentTransactionList";
import SkeletonCard from "../components/shared/SkeletonCard";
export default function DashboardPage() {
  const { summary, loading } = useDailySummary();
  const { items } = useTransactions({ limit: 8, today: true });
  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  return (
    <div className="space-y-7">
      <div className="flex items-end justify-between">
        <div>
          <p className="mono-label">Workspace overview</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Good morning.</h2>
          <p className="mt-1 text-sm text-slate-500">
            Here’s what’s happening in your ledger today.
          </p>
        </div>
        <Link
          to="/transactions/new"
          className="hidden rounded-[8px] bg-fuelo-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-95 sm:inline-flex"
        >
          + Add transaction
        </Link>
      </div>
      <DailySummaryCard summary={summary} />
      <NotificationBanner
        sent={summary?.notifications?.sent || 0}
        failed={summary?.notifications?.failed || 0}
      />
      <div className="grid gap-7 lg:grid-cols-[.8fr_1.2fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="mono-label">Inventory pulse</p>
              <h3 className="mt-1 font-bold">Today's movement</h3>
            </div>
          </div>
          <div className="panel p-5">
            {(summary?.items || []).map((i) => (
              <ItemStatRow key={i.name} item={i} />
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="mono-label">Latest activity</p>
              <h3 className="mt-1 font-bold">Recent transactions</h3>
            </div>
            <Link
              to="/transactions"
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <RecentTransactionList transactions={items} />
        </section>
      </div>
    </div>
  );
}
