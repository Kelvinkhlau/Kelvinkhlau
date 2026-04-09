import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "🏠" },
  { to: "/email", label: "Email", icon: "📧" },
  { to: "/project", label: "Project", icon: "📁" },
  { to: "/todo", label: "Todo", icon: "✅" },
  { to: "/idea", label: "Idea", icon: "💡" },
  { to: "/card", label: "Card", icon: "🗂️" },
  { to: "/calendar", label: "Calendar", icon: "📅" },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/40 p-4">
      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-brand-500/20 text-brand-100"
                  : "text-slate-300 hover:bg-slate-800/60"
              }`
            }
          >
            <span className="text-base">{link.icon}</span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
