import { Home, List, Plus, MessageSquare } from "lucide-react";
import { NavLink } from "react-router-dom";
export default function BottomNav() {
  const links = [
    ["/", "Overview", Home],
    ["/transactions/new", "Add", Plus],
    ["/transactions", "History", List],
    ["/messages", "Messages", MessageSquare],
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white md:hidden">
      <div className="grid grid-cols-4">
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
