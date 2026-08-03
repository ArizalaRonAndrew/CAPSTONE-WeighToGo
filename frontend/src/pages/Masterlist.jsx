import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";
import { ageInMonths } from "../utils/age";
import { currentMonth } from "../utils/month";
import RegisterChildModal from "../components/RegisterChildModal";
import ManageChildModal from "../components/ManageChildModal";

export default function Masterlist() {
  const { user } = useAuth();
  const { barangays } = useBarangays();
  const isAdmin = user?.role === "MNAO";

  const [barangayFilter, setBarangayFilter] = useState("");
  const [children, setChildren] = useState([]);
  const [checkedChildIds, setCheckedChildIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [manageChildId, setManageChildId] = useState(null);

  function load() {
    setLoading(true);
    const query = isAdmin && barangayFilter ? `?barangay=${encodeURIComponent(barangayFilter)}` : "";
    Promise.all([api.get(`/children${query}`), api.get("/assessments")])
      .then(([childrenData, assessments]) => {
        setChildren(childrenData);
        const month = currentMonth();
        const checked = new Set(
          assessments.filter((a) => a.date_measured?.slice(0, 7) === month).map((a) => a.child_id)
        );
        setCheckedChildIds(checked);
      })
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
              <th>Name of Child</th>
              <th>Parent / Guardian</th>
              <th>Gender</th>
              <th>Age (mos)</th>
              <th>Purok / Sitio</th>
              <th>Checkup Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="loading-state">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && children.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  No children registered yet.
                </td>
              </tr>
            )}
            {children.map((child) => {
              const isChecked = checkedChildIds.has(child.id);
              return (
                <tr key={child.id}>
                  <td style={{ fontWeight: 700 }}>{child.name}</td>
                  <td>{child.parent_name}</td>
                  <td>{child.gender}</td>
                  <td>{ageInMonths(child.dob)}</td>
                  <td>{child.purok}</td>
                  <td>
                    <span className={`status-pill ${isChecked ? "status-pill-checked" : "status-pill-pending"}`}>
                      {isChecked ? "✓ Checked" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary" onClick={() => setManageChildId(child.id)}>
                      Manage
                    </button>
                  </td>
                </tr>
              );
            })}
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

      {manageChildId && (
        <ManageChildModal
          childId={manageChildId}
          onClose={() => setManageChildId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
