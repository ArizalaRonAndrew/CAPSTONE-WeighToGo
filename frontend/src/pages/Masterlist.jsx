import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ageInMonths } from "../utils/age";
import { currentMonth } from "../utils/month";
import { formatNameForTable } from "../utils/name";
import RegisterChildModal from "../components/RegisterChildModal";
import ManageChildModal from "../components/ManageChildModal";
import Dropdown from "../components/Dropdown";

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const PAGE_SIZE = 7;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 701px)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 701px)");
    const handler = (e) => setIsDesktop(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isDesktop;
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
  const isDesktop = useIsDesktop();

  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [checkupFilter, setCheckupFilter] = useState("");
  const [children, setChildren] = useState([]);
  const [checkedChildIds, setCheckedChildIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [manageChildId, setManageChildId] = useState(null);
  const [page, setPage] = useState(1);

  function load() {
    setLoading(true);
    setError("");
    Promise.all([api.get("/children"), api.get("/assessments")])
      .then(([childrenData, assessments]) => {
        setChildren(childrenData);
        const month = currentMonth();
        const checked = new Set(
          assessments.filter((a) => a.date_measured?.slice(0, 7) === month).map((a) => a.child_id)
        );
        setCheckedChildIds(checked);
      })
      .catch((err) => setError(err.message || "Failed to load the masterlist"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    setPage(1);
  }, [search, purokFilter, checkupFilter]);

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

  const totalPages = Math.max(1, Math.ceil(filteredChildren.length / PAGE_SIZE));
  const pageChildren = isDesktop
    ? filteredChildren.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : filteredChildren;
  const rangeStart = filteredChildren.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredChildren.length);

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
        <h1>{user.assigned_barangay} Masterlist</h1>
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

      {error && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          {error}{" "}
          <button type="button" className="btn btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

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
            <Dropdown
              value={purokFilter}
              options={[{ value: "", label: "All puroks" }, ...purokOptions.map((purok) => ({ value: purok, label: purok }))]}
              onChange={setPurokFilter}
            />
          </div>
          <div className="field">
            <label>Checkup Status</label>
            <Dropdown
              value={checkupFilter}
              options={[
                { value: "", label: "All statuses" },
                { value: "checked", label: "Checked" },
                { value: "pending", label: "Pending" },
              ]}
              onChange={setCheckupFilter}
            />
          </div>
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
            {!loading && !error && children.length === 0 && (
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
            {pageChildren.map((child) => {
              const isChecked = checkedChildIds.has(child.id);
              return (
                <tr key={child.id}>
                  <td data-label="Name of Child">
                    <div className="child-name-cell">
                      <span className="avatar-circle">{initials(child.name)}</span>
                      <span style={{ fontWeight: 700 }}>{formatNameForTable(child.name)}</span>
                    </div>
                  </td>
                  <td data-label="Parent / Guardian">{formatNameForTable(child.parent_name)}</td>
                  <td data-label="Gender">{child.gender}</td>
                  <td data-label="Age (mos)">{ageInMonths(child.dob)}</td>
                  <td data-label="Purok / Sitio">{child.purok}</td>
                  <td data-label="Checkup Status">
                    <span className={`status-pill ${isChecked ? "status-pill-checked" : "status-pill-pending"}`}>
                      {isChecked ? "✓ Checked" : "Pending"}
                    </span>
                  </td>
                  <td data-label="Action">
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

      {isDesktop && (
        <div className="pagination-bar">
          <span className="pagination-info">
            {filteredChildren.length === 0 ? "No records" : `Showing ${rangeStart}–${rangeEnd} of ${filteredChildren.length}`}
          </span>
          <div className="pagination-controls">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="pagination-page">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

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
