import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const BNS_LINKS = [
  { to: "/bns/masterlist", label: "Masterlist" },
  { to: "/bns/vitamins", label: "Vitamins & Deworming" },
  { to: "/bns/reports", label: "Reports" },
];

const ADMIN_LINKS = [
  { to: "/admin/trends", label: "Health Trends" },
  { to: "/admin/masterlist", label: "Masterlist" },
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/map", label: "Barangay Map" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user?.role === "MNAO" ? ADMIN_LINKS : BNS_LINKS;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">WeighToGo</div>
      <div className="sidebar-user">
        {user?.email}
        <br />
        {user?.role === "MNAO" ? "Administrator" : `BNS - ${user?.assigned_barangay}`}
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <button type="button" className="sidebar-logout" onClick={handleLogout}>
        Log Out
      </button>
    </aside>
  );
}
