import { lazy, Suspense, useState } from "react";
import { NavLink, Link, Routes, Route } from "react-router-dom";
import {
  Check,
  ChevronDown,
  LayoutDashboard,
  List,
  LogOut,
  Plus,
  Settings,
  Users,
  MessageSquare,
  Wallet,
  Package,
  ClipboardList,
  BarChart3,
  Clock3,
  Droplets,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import WorkspaceBillingNotice from "../components/billing/WorkspaceBillingNotice";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import QuickAddFAB from "../components/shared/QuickAddFAB";
import DashboardPage from "../pages/DashboardPage";
import NewTransactionPage from "../pages/NewTransactionPage";
import TransactionListPage from "../pages/TransactionListPage";
import TransactionDetailPage from "../pages/TransactionDetailPage";
import MessagesPage from "../pages/MessagesPage";
import WorkspacesPage from "../pages/WorkspacesPage";
import SettingsPage from "../pages/SettingsPage";

const pumpNav = [
  ["/pump/shifts", "Shifts", Clock3, "shifts", "shifts:operate"],
  ["/pump/tanks", "Tanks & Deliveries", Droplets, "tanks", "tanks:dip"],
  ["/pump/report", "Pump Report", BarChart3, "pumpReports", "reports:read"],
];

const routePermissions = {
  "/": "dashboard:read",
  "/transactions/new": "transactions:create",
  "/transactions": "transactions:read",
  "/transactions/:id": "transactions:read",
  "/members": "members:read",
  "/inventory": "inventory:read",
  "/credit": "credit:read",
  "/credit/:id": "credit:read",
  "/messages": "notifications:manage",
  "/workspaces": "account:manage",
  "/settings": "account:manage",
  "/activity": "audit:read",
  "/settings/billing": "billing:manage",
  "/reports": "reports:read",
};

const PumpShiftsPage = lazy(() => import("../pages/PumpShiftsPage"));
const PumpTanksPage = lazy(() => import("../pages/PumpTanksPage"));
const PumpReportPage = lazy(() => import("../pages/PumpReportPage"));
const ReportsPage = lazy(() => import("../pages/ReportsPage"));
const BillingPage = lazy(() => import("../pages/BillingPage"));
const ActivityPage = lazy(() => import("../pages/ActivityPage"));
const MembersPage = lazy(() => import("../pages/MembersPage"));
const InventoryPage = lazy(() => import("../pages/InventoryPage"));
const CreditPage = lazy(() => import("../pages/CreditPage"));

export default function AppShell() {
  const { user, workspaces, logout } = useAuth();
  const can = (permission) => user?.permissions?.includes(permission);
  const pumpItems = pumpNav.filter(
    ([path, , , flag, permission]) =>
      user?.verticalFeatures?.[flag] &&
      can(permission) &&
      (path !== "/pump/tanks" || can("tanks:manage") || user?.config?.attendantsCanDip)
  );
  const canVisit = (path) =>
    path.startsWith("/pump/") ? pumpItems.some(([to]) => to === path) : can(routePermissions[path]);
  const access = (path, element) =>
    canVisit(path) ? element : <p role="alert">You do not have access to this page.</p>;
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
            <Item to="/inventory" icon={Package} label="Inventory" />
            <Item to="/credit" icon={Wallet} label="Credit / Udhaar" />
          </nav>
          {pumpItems.length > 0 && (
            <nav aria-label="Pump operations" className="mt-4 space-y-1">
              {pumpItems.map(([path, label, Icon]) => (
                <Item key={path} to={path} icon={Icon} label={label} allowed />
              ))}
            </nav>
          )}
          <p className="mono-label mt-7 px-2">Manage</p>
          <nav className="mt-2 space-y-1">
            <Item to="/members" icon={Users} label="Members" />
            <Item to="/messages" icon={MessageSquare} label="Messages" />
            <Item to="/reports" icon={BarChart3} label="Reports" />
            <Item to="/activity" icon={ClipboardList} label="Activity log" />
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
          <WorkspaceBillingNotice />
          {pumpItems.length > 0 && (
            <nav
              aria-label="Mobile pump operations"
              className="mb-4 flex gap-2 overflow-x-auto md:hidden"
            >
              {pumpItems.map(([path, label]) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-fuelo-ink text-white" : "bg-slate-100 text-slate-700"}`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <Suspense fallback={<p className="text-sm text-slate-500">Loading page…</p>}>
            <Routes>
              <Route path="/" element={access("/", <DashboardPage />)} />
              <Route
                path="/pump/shifts"
                element={access("/pump/shifts", <PumpShiftsPage key={user?.workspaceId} />)}
              />
              <Route
                path="/pump/tanks"
                element={access("/pump/tanks", <PumpTanksPage key={user?.workspaceId} />)}
              />
              <Route
                path="/pump/report"
                element={access("/pump/report", <PumpReportPage key={user?.workspaceId} />)}
              />
              <Route
                path="/transactions/new"
                element={access("/transactions/new", <NewTransactionPage />)}
              />
              <Route
                path="/transactions"
                element={access("/transactions", <TransactionListPage />)}
              />
              <Route
                path="/transactions/:id"
                element={access("/transactions/:id", <TransactionDetailPage />)}
              />
              <Route path="/members" element={access("/members", <MembersPage />)} />
              <Route
                path="/inventory"
                element={access("/inventory", <InventoryPage key={user?.workspaceId} />)}
              />
              <Route path="/credit" element={access("/credit", <CreditPage />)} />
              <Route path="/credit/:id" element={access("/credit/:id", <CreditPage />)} />
              <Route path="/messages" element={access("/messages", <MessagesPage />)} />
              <Route path="/workspaces" element={access("/workspaces", <WorkspacesPage />)} />
              <Route
                path="/reports"
                element={access("/reports", <ReportsPage key={user?.workspaceId} />)}
              />
              <Route path="/activity" element={access("/activity", <ActivityPage />)} />
              <Route
                path="/settings/billing"
                element={access("/settings/billing", <BillingPage />)}
              />
              <Route path="/settings" element={access("/settings", <SettingsPage />)} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <BottomNav />
      <QuickAddFAB />
    </div>
  );
}
function Item({ to, icon: Icon, label, allowed }) {
  const { user } = useAuth();
  if (!allowed && !user?.permissions?.includes(routePermissions[to])) return null;
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
