import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";
import { formatAge } from "../utils/age";
import RegisterChildModal from "../components/RegisterChildModal";

export default function Masterlist() {
  const { user } = useAuth();
  const { barangays } = useBarangays();
  const navigate = useNavigate();
  const isAdmin = user?.role === "MNAO";

  const [barangayFilter, setBarangayFilter] = useState("");
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  function load() {
    setLoading(true);
    const query = isAdmin && barangayFilter ? `?barangay=${encodeURIComponent(barangayFilter)}` : "";
    api
      .get(`/children${query}`)
      .then(setChildren)
      .finally(() => setLoading(false));
  }

  useEffect(load, [barangayFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>{isAdmin ? "Masterlist — All Barangays" : `${user.assigned_barangay} Masterlist`}</h1>
        <button className="btn" onClick={() => setShowRegister(true)}>
          + Register Child
        </button>
      </div>

      {isAdmin && (
        <div className="filter-bar">
          <div className="field">
            <label>Barangay</label>
            <select className="input" value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
              <option value="">All barangays</option>
              {barangays.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>Gender</th>
              {isAdmin && <th>Barangay</th>}
              <th>Purok</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="loading-state">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && children.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No children registered yet.
                </td>
              </tr>
            )}
            {children.map((child) => (
              <tr key={child.id} className="clickable" onClick={() => navigate(`/children/${child.id}`)}>
                <td>{child.name}</td>
                <td>{formatAge(child.dob)}</td>
                <td>{child.gender}</td>
                {isAdmin && <td>{child.barangay}</td>}
                <td>{child.purok}</td>
                <td>{child.is_ip ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showRegister && (
        <RegisterChildModal
          onClose={() => setShowRegister(false)}
          onRegistered={() => {
            setShowRegister(false);
            load();
          }}
        />
      )}
    </div>
  );
}
