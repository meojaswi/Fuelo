import { useAuth } from "../context/AuthContext";
import { ArrowLeft, Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
const map = {
  "/": "Overview",
  "/transactions": "Transactions",
  "/transactions/new": "New transaction",
  "/inventory": "Inventory",
  "/credit": "Credit / Udhaar",
  "/members": "Members",
  "/messages": "Messages",
  "/workspaces": "Workspaces",
  "/settings": "Settings",
  "/activity": "Activity log",
  "/reports": "Reports",
  "/pump/shifts": "Shifts",
  "/pump/tanks": "Tanks & Deliveries",
  "/pump/report": "Pump Report",
  "/settings/billing": "Billing",
};
export default function TopBar() {
  const { user } = useAuth();
  const l = useLocation(),
    n = useNavigate(),
    back = l.pathname !== "/";
  const title = l.pathname.startsWith("/credit/") ? "Customer ledger" : map[l.pathname] || "Page";
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        {back && (
          <button onClick={() => n(-1)} className="rounded-[8px] p-2 hover:bg-slate-100">
            <ArrowLeft size={17} />
          </button>
        )}
        <div>
          <p className="mono-label hidden sm:block">Workspace / Fuelo</p>
          <h1 className="font-bold">{title}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">
          {user?.role}
        </span>
        {user?.permissions?.includes("notifications:manage") && (
          <button className="relative rounded-[8px] p-2.5 hover:bg-slate-100">
            <Bell size={18} />
            <i className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-fuelo-coral" />
          </button>
        )}
      </div>
    </header>
  );
}
