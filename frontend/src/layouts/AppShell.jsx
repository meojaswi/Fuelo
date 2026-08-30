import { NavLink, Link, Routes, Route } from "react-router-dom";
import {
  BarChart3,
  LayoutDashboard,
  List,
  LogOut,
  Plus,
  Settings,
  Users,
  Wallet,
  MessageSquare,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import QuickAddFAB from "../components/shared/QuickAddFAB";
import DashboardPage from "../pages/DashboardPage";
import NewTransactionPage from "../pages/NewTransactionPage";
import TransactionListPage from "../pages/TransactionListPage";
import TransactionDetailPage from "../pages/TransactionDetailPage";
import MessagesPage from "../pages/MessagesPage";
import WorkspacesPage from "../pages/WorkspacesPage";
export default function AppShell() {
  const { user, logout } = useAuth();
  const workspace = user?.workspace?.name || user?.workspaceName || "Primary workspace";
  return (
    <div className="min-h-screen bg-white">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white md:block">
        <div className="flex h-16 items-center border-b px-6">
          <Link to="/" className="block hover:opacity-80 transition">
            <div className="text-lg font-extrabold tracking-tight">
              fuelo<span className="text-fuelo-coral">.</span>
            </div>
            <div className="mono-label mt-0.5">ledger workspace</div>
          </Link>
        </div>
        <div className="p-4">
          <Link to="/workspaces" className="block mb-7 rounded-[8px] border border-slate-200 bg-slate-50 p-3.5 hover:border-slate-300 transition group">
            <div className="flex items-center justify-between">
              <p className="mono-label">Current workspace</p>
              <span className="text-[10px] text-slate-400 group-hover:text-fuelo-ink font-semibold uppercase tracking-wider">Change</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-fuelo-ink text-xs font-bold text-white">
                {workspace[0]}
              </span>
              <span className="truncate text-sm font-semibold">{workspace}</span>
            </div>
          </Link>
          <p className="mono-label px-2">Workspace</p>
          <nav className="mt-2 space-y-1">
            <Item to="/" icon={LayoutDashboard} label="Overview" />
            <Item to="/transactions/new" icon={Plus} label="New transaction" />
            <Item to="/transactions" icon={List} label="Transactions" />
          </nav>
          <p className="mono-label mt-7 px-2">Manage</p>
          <nav className="mt-2 space-y-1">
            <Item to="/members" icon={Users} label="Members" />
            <Item to="/messages" icon={MessageSquare} label="Messages" />
            <Item to="/settings" icon={Settings} label="Settings" />
          </nav>
        </div>
        <button
          onClick={logout}
          className="absolute bottom-5 left-5 flex items-center gap-2 text-sm text-slate-500 hover:text-fuelo-coral"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="md:pl-64">
        <TopBar />
        <div className="mx-auto max-w-[1400px] p-4 pb-24 md:p-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions/new" element={<NewTransactionPage />} />
            <Route path="/transactions" element={<TransactionListPage />} />
            <Route path="/transactions/:id" element={<TransactionDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
          </Routes>
        </div>
      </main>
      <BottomNav />
      <QuickAddFAB />
    </div>
  );
}
function Item({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === "/" || to === "/transactions"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-fuelo-ink text-white" : "text-slate-600 hover:bg-slate-50"}`
      }
    >
      <Icon size={17} />
      {label}
    </NavLink>
  );
}
