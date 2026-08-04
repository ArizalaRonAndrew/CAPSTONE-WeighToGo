import { useEffect, useState } from "react";
import { api } from "../api/client";
import ManageChildModal from "../components/ManageChildModal";
import { formatNameForTable } from "../utils/name";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

function ordinal(n) {
  return ORDINALS[n - 1] || `${n}th`;
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function DueBadge({ dose }) {
  return (
    <span className={`badge ${dose.overdue ? "badge-severe" : "badge-mild"}`}>
      {dose.supplement_type} — {ordinal(dose.dose_order)} dose{dose.overdue ? " overdue" : ""}
    </span>
  );
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

export default function VitaminsDeworming() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [manageChildId, setManageChildId] = useState(null);

  function load() {
    setLoading(true);
    api
      .get("/supplements/due")
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => (a.child.purok || "").localeCompare(b.child.purok || "") || a.child.name.localeCompare(b.child.name)
        );
        setEntries(sorted);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const purokOptions = [...new Set(entries.map((e) => e.child.purok).filter(Boolean))].sort();

  const filteredEntries = entries.filter(({ child, due }) => {
    if (search && !child.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (purokFilter && child.purok !== purokFilter) return false;
    if (overdueOnly && !due.some((d) => d.overdue)) return false;
    return true;
  });

  const totalDue = entries.reduce((sum, e) => sum + e.due.length, 0);
  const overdueChildren = entries.filter((e) => e.due.some((d) => d.overdue)).length;
  const hasActiveFilters = Boolean(search || purokFilter || overdueOnly);

  function clearFilters() {
    setSearch("");
    setPurokFilter("");
    setOverdueOnly(false);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Vitamins &amp; Deworming</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Children appear here the exact day their age reaches a Vitamin A or Deworming dose window.
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat-tile">
          <div className="value">{loading ? "…" : entries.length}</div>
          <div className="label">Children needing a dose</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{loading ? "…" : totalDue}</div>
          <div className="label">Total doses due</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{loading ? "…" : overdueChildren}</div>
          <div className="label">Children overdue</div>
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
            <label>Dose Status</label>
            <select
              className="input"
              value={overdueOnly ? "overdue" : ""}
              onChange={(e) => setOverdueOnly(e.target.value === "overdue")}
            >
              <option value="">All due</option>
              <option value="overdue">Overdue only</option>
            </select>
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
          Showing {filteredEntries.length} of {entries.length} children
        </p>
      )}

      {!loading && entries.length === 0 && (
        <div className="banner banner-success" style={{ marginBottom: 20 }}>
          No children currently need a dose.
        </div>
      )}

      {(loading || entries.length > 0) && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name of Child</th>
                <th>Parent / Guardian</th>
                <th>Purok / Sitio</th>
                <th>Age</th>
                <th>Doses Due</th>
                <th>Action</th>
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
              {!loading && entries.length > 0 && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <div>No children match your filters.</div>
                    <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
              {!loading &&
                filteredEntries.map(({ child, ageInMonths, due }) => (
                  <tr key={child.id} className="clickable" onClick={() => setManageChildId(child.id)}>
                    <td data-label="Name of Child">
                      <div className="child-name-cell">
                        <span className="avatar-circle">{initials(child.name)}</span>
                        <span style={{ fontWeight: 700 }}>{formatNameForTable(child.name)}</span>
                      </div>
                    </td>
                    <td data-label="Parent / Guardian">{child.parent_name}</td>
                    <td data-label="Purok / Sitio">{child.purok}</td>
                    <td data-label="Age">{ageInMonths} mo</td>
                    <td data-label="Doses Due">
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {due.map((dose) => (
                          <DueBadge key={`${dose.supplement_type}-${dose.dose_order}`} dose={dose} />
                        ))}
                      </div>
                    </td>
                    <td data-label="Action">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManageChildId(child.id);
                        }}
                      >
                        Manage Supplements
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {manageChildId && (
        <ManageChildModal
          childId={manageChildId}
          initialTab="vitamins"
          onClose={() => setManageChildId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
