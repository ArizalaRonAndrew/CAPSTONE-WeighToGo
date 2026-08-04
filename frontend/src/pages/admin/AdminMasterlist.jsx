import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useBarangays } from "../../hooks/useBarangays";
import { currentMonth } from "../../utils/month";
import { formatNameForTable } from "../../utils/name";
import StatusBadge from "../../components/StatusBadge";
import ManageChildModal from "../../components/ManageChildModal";

function formatShortDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${month}-${day}-${d.getUTCFullYear()}`;
}

function monthLabel(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
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

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6" />
      <path d="M15.5 6a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.3c2 .5 3.7 2.6 3.7 5.7" />
    </svg>
  );
}

const PAGE_SIZE = 10;

export default function AdminMasterlist() {
  const { barangays } = useBarangays();

  const [month, setMonth] = useState(currentMonth());
  const [barangayFilter, setBarangayFilter] = useState("");
  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [viewChildId, setViewChildId] = useState(null);

  function load() {
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams({ month });
    if (barangayFilter) params.set("barangay", barangayFilter);
    api
      .get(`/reports/monthly-masterlist?${params.toString()}`)
      .then(setReport)
      .finally(() => setLoading(false));
  }

  useEffect(load, [month, barangayFilter]);

  const rows = report?.rows || [];
  const purokOptions = [...new Set(rows.map((r) => r.purok).filter(Boolean))].sort();

  const filteredRows = rows.filter((row) => {
    if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (purokFilter && row.purok !== purokFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredRows.length);

  const hasActiveFilters = Boolean(search || purokFilter || barangayFilter);

  function clearFilters() {
    setSearch("");
    setPurokFilter("");
    setBarangayFilter("");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Masterlist — All Barangays</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Checkup data for {monthLabel(month)}.
          </p>
        </div>
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      <div className="card hero-stat-card">
        <div>
          <div className="hero-stat-label">Total Registered</div>
          <div className="hero-stat-value">{loading ? "…" : report?.totalRegistered ?? 0}</div>
          <div className="hero-stat-subtitle">Filtered child masterlist view</div>
        </div>
        <div className="hero-stat-icon">
          <PeopleIcon />
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
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {!loading && (
        <p className="results-count">
          Showing {filteredRows.length} of {rows.length} checkups this month
        </p>
      )}

      <div className="card">
        <div className="table-wrap paginated-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Address / Purok</th>
                <th>Mother / Caregiver</th>
                <th>Name of Child</th>
                <th>IP Group</th>
                <th>Sex</th>
                <th>Date of Birth</th>
                <th>Date Measured</th>
                <th>Weight (kg)</th>
                <th>Height (cm)</th>
                <th>Age (mos)</th>
                <th>WFA Status</th>
                <th>HFA Status</th>
                <th>WFL/H Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={14} className="loading-state">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="empty-state">
                    No checkups recorded for {monthLabel(month)}.
                  </td>
                </tr>
              )}
              {!loading && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={14} className="empty-state">
                    <div>No children match your filters.</div>
                    <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
              {pageRows.map((row) => (
                <tr key={row.assessment_id}>
                  <td data-label="Address / Purok">
                    <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{row.barangay}</div>
                    <div style={{ fontWeight: 700 }}>{row.purok}</div>
                  </td>
                  <td data-label="Mother / Caregiver">{row.parent_name}</td>
                  <td data-label="Name of Child" style={{ fontWeight: 700 }}>
                    {formatNameForTable(row.name)}
                  </td>
                  <td data-label="IP Group">{row.is_ip ? "YES" : "NO"}</td>
                  <td data-label="Sex">{row.gender?.charAt(0)}</td>
                  <td data-label="Date of Birth">{formatShortDate(row.dob)}</td>
                  <td data-label="Date Measured">{formatShortDate(row.date_measured)}</td>
                  <td data-label="Weight (kg)">{row.weight}</td>
                  <td data-label="Height (cm)">{row.height}</td>
                  <td data-label="Age (mos)">{row.age_in_months}</td>
                  <td data-label="WFA Status">
                    <StatusBadge status={row.wfa_status} compact />
                  </td>
                  <td data-label="HFA Status">
                    <StatusBadge status={row.hfa_status} compact />
                  </td>
                  <td data-label="WFL/H Status">
                    <StatusBadge status={row.wfl_h_status} compact />
                  </td>
                  <td data-label="Action">
                    <button className="btn btn-secondary" onClick={() => setViewChildId(row.child_id)}>
                      Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span className="pagination-info">
            {filteredRows.length === 0 ? "No records" : `Showing ${rangeStart}–${rangeEnd} of ${filteredRows.length}`}
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
      </div>

      {viewChildId && (
        <ManageChildModal childId={viewChildId} onClose={() => setViewChildId(null)} readOnly />
      )}
    </div>
  );
}
