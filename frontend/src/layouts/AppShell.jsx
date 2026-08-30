import { useState } from "react";
import { NavLink, Link, Routes, Route } from "react-router-dom";
import {
  BarChart3,
  Check,
  ChevronDown,
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
import MembersPage from "../pages/MembersPage";
import WorkspacesPage from "../pages/WorkspacesPage";
import SettingsPage from "../pages/SettingsPage";

export default function AppShell() {
  const { user, workspaces, logout } = useAuth();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspace =
    user?.businessName || user?.workspace?.name || user?.workspaceName || "Primary workspace";
  const workspaceList = workspaces?.length
    ? workspaces
    : [{ workspaceId: user?.workspaceId, businessName: workspace }];

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
          <div className="relative mb-7">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="flex w-full items-center gap-2.5 rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100"
            >
              <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-fuelo-ink text-xs font-bold text-white">
                {workspace[0]}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Current workspace
                </span>
                <span className="block truncate text-sm font-semibold text-slate-700">
                  {workspace}
                </span>
              </span>

              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  workspaceMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              className={`absolute left-0 right-0 top-full z-20 mt-2 origin-top overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-lg transition-all duration-200 ${
                workspaceMenuOpen
                  ? "scale-100 translate-y-0 opacity-100"
                  : "pointer-events-none scale-95 -translate-y-1 opacity-0"
              }`}
            >
              <div className="px-2 pb-2 pt-3">
                <p className="mono-label px-2 pb-2 text-slate-400">Workspaces</p>

                {workspaceList.slice(0, 4).map((ws) => {
                  const name = ws.businessName || ws.name || "Workspace";
                  const vertical = ws.verticalType || "Workspace";
                  const isActive = ws.workspaceId === user?.workspaceId || name === workspace;

                  return (
                    <Link
                      key={ws.workspaceId || name}
                      to="/workspaces"
                      onClick={() => setWorkspaceMenuOpen(false)}
                      className={`flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2.5 text-left transition ${
                        isActive ? "bg-fuelo-coral/10" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-slate-100 text-xs font-bold text-slate-600">
                        {name.charAt(0)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-700">
                          {name}
                        </span>
                        <span className="mono-label text-[10px] text-slate-400">
                          {isActive ? "Active" : vertical}
                        </span>
                      </span>

                      {isActive && <Check className="h-4 w-4 shrink-0 text-fuelo-coral" />}
                    </Link>
                  );
                })}
              </div>

              <div className="border-t border-slate-200 px-3 py-3">
                <Link
                  to="/workspaces"
                  onClick={() => setWorkspaceMenuOpen(false)}
                  className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition hover:text-fuelo-ink"
                >
                  Manage workspaces →
                </Link>
              </div>
            </div>
          </div>
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
            <Route path="/members" element={<MembersPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
