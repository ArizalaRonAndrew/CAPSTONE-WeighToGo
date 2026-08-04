import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const BNS_LINKS = [
  { to: "/bns/masterlist", label: "Masterlist", icon: "list" },
  { to: "/bns/vitamins", label: "Vitamins & Deworming", icon: "droplet" },
  { to: "/bns/monthly-report", label: "Monthly Report", icon: "calendar" },
];

const ADMIN_LINKS = [
  { to: "/admin/trends", label: "Health Trends", icon: "trending" },
  { to: "/admin/masterlist", label: "Masterlist", icon: "list" },
  { to: "/admin/reports", label: "Reports", icon: "chart" },
  { to: "/admin/map", label: "Barangay Map", icon: "pin" },
];

const ICON_PATHS = {
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  droplet: <path d="M12 3s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11Z" />,
  chart: (
    <>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M2.5 20h19" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  trending: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg
      className="sidebar-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="17"
      height="17"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === "MNAO" ? ADMIN_LINKS : BNS_LINKS;
  const initial = user?.email?.[0]?.toUpperCase() || "?";

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M5 20c9 0 14-5 14-14V5h-1C9 5 4 10 4 19v1Z" />
          </svg>
        </span>
        WeighToGo
      </div>

      <div className="sidebar-user">
        <span className="sidebar-avatar">{initial}</span>
        <div className="sidebar-user-info">
          <div className="sidebar-user-email" title={user?.email}>
            {user?.email}
          </div>
          <span className="sidebar-role-pill">
            {user?.role === "MNAO" ? "Administrator" : `BNS · ${user?.assigned_barangay}`}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon name={link.icon} />
            {link.label}
          </NavLink>
        ))}
      </nav>

      <button type="button" className="sidebar-logout" onClick={handleLogout}>
        <Icon name="logout" />
        Log Out
      </button>
    </aside>
  );
}
