import { Home, List, Plus, MessageSquare, Wallet } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
export default function BottomNav() {
  const { user } = useAuth();
  const links = [
    ["/", "Overview", Home],
    ["/transactions/new", "Add", Plus],
    ["/transactions", "History", List],
    ["/credit", "Udhaar", Wallet, "credit:read"],
    ["/messages", "Messages", MessageSquare, "notifications:manage"],
  ].filter(([, , , permission]) => !permission || user?.permissions?.includes(permission));
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}
      >
        {links.map(([to, I, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/" || to === "/transactions"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-3 text-[10px] font-semibold ${isActive ? "text-fuelo-coral" : "text-slate-400"}`
            }
          >
            <Icon size={19} />
            {I}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
