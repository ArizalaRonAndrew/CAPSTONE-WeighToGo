import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";
import { formatAge } from "../utils/age";
import { currentMonth } from "../utils/month";
import RegisterChildModal from "../components/RegisterChildModal";
import ManageChildModal from "../components/ManageChildModal";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function SearchIcon() {
  return (
    <svg
      className="search-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function Masterlist() {
  const { user } = useAuth();
  const { barangays } = useBarangays();
  const isAdmin = user?.role === "MNAO";

  const [barangayFilter, setBarangayFilter] = useState("");
  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [checkupFilter, setCheckupFilter] = useState("");
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

  const purokOptions = [...new Set(children.map((c) => c.purok).filter(Boolean))].sort();

  const filteredChildren = children.filter((child) => {
    if (search && !child.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (purokFilter && child.purok !== purokFilter) return false;
    if (checkupFilter) {
      const isChecked = checkedChildIds.has(child.id);
      if (checkupFilter === "checked" && !isChecked) return false;
      if (checkupFilter === "pending" && isChecked) return false;
    }
    return true;
  });

  const checkedCount = children.filter((c) => checkedChildIds.has(c.id)).length;
  const hasActiveFilters = Boolean(search || purokFilter || checkupFilter);

  function clearFilters() {
    setSearch("");
    setPurokFilter("");
    setCheckupFilter("");
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isAdmin ? "Masterlist — All Barangays" : `${user.assigned_barangay} Masterlist`}</h1>
        <button className="btn" onClick={() => setShowRegister(true)}>
          + Register Child
        </button>
      </div>

      <div className="stat-row">
        <div className="card stat-tile">
          <div className="value">{children.length}</div>
          <div className="label">Registered children</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{checkedCount}</div>
          <div className="label">Checked this month</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{children.length - checkedCount}</div>
          <div className="label">Pending this month</div>
        </div>
      </div>

      <div className="card filter-card">
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div className="field search-field">
            <label>Search</label>
            <div className="search-input-wrap">
              <SearchIcon />
              <input
                className="input"
                type="text"
                placeholder="Search child's name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>Purok / Sitio</label>
            <select className="input" value={purokFilter} onChange={(e) => setPurokFilter(e.target.value)}>
              <option value="">All puroks</option>
              {purokOptions.map((purok) => (
                <option key={purok} value={purok}>
                  {purok}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Checkup Status</label>
            <select className="input" value={checkupFilter} onChange={(e) => setCheckupFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="checked">Checked</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {isAdmin && (
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
          )}
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="results-count">
          Showing {filteredChildren.length} of {children.length} children
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name of Child</th>
              <th>Parent / Guardian</th>
              <th>Gender</th>
              <th>Age</th>
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
            {!loading && children.length > 0 && filteredChildren.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  <div>No children match your filters.</div>
                  <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
            {filteredChildren.map((child) => {
              const isChecked = checkedChildIds.has(child.id);
              return (
                <tr key={child.id}>
                  <td>
                    <div className="child-name-cell">
                      <span className="avatar-circle">{initials(child.name)}</span>
                      <span style={{ fontWeight: 700 }}>{child.name}</span>
                    </div>
                  </td>
                  <td>{child.parent_name}</td>
                  <td>{child.gender}</td>
                  <td>{formatAge(child.dob)}</td>
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
