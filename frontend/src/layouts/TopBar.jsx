import { ArrowLeft, Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
const map = {
  "/": "Overview",
  "/transactions": "Transactions",
  "/transactions/new": "New transaction",
};
export default function TopBar() {
  const l = useLocation(),
    n = useNavigate(),
    back = l.pathname !== "/";
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
          <h1 className="font-bold">{map[l.pathname] || "Transaction"}</h1>
        </div>
      </div>
      <button className="relative rounded-[8px] p-2.5 hover:bg-slate-100">
        <Bell size={18} />
        <i className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-fuelo-coral" />
      </button>
    </header>
  );
}
