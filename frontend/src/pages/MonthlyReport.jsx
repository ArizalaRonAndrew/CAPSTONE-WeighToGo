import { useEffect, useState } from "react";
import { api } from "../api/client";
import { currentMonth } from "../utils/month";
import { colorVarForStatus } from "../utils/statusGroups";
import StatusBadge from "../components/StatusBadge";

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

const INDICATOR_DEFS = [
  {
    key: "wfa_status",
    label: "Weight-for-Age",
    abbr: "WFA",
    statuses: ["Normal", "Underweight", "Severely Underweight"],
  },
  {
    key: "hfa_status",
    label: "Height-for-Age",
    abbr: "HFA",
    statuses: ["Normal", "Stunted", "Severely Stunted"],
  },
  {
    key: "wfl_h_status",
    label: "Weight-for-Length/Height",
    abbr: "WFL/H",
    statuses: ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"],
  },
];

function tallyBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6" />
      <path d="M15.5 6a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.3c2 .5 3.7 2.6 3.7 5.7" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
      <path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" />
      <path d="M10.5 13 21 3" />
    </svg>
  );
}

const PAGE_SIZE = 10;

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  function load() {
    setLoading(true);
    setSubmitError("");
    Promise.all([
      api.get(`/reports/monthly-masterlist?month=${month}`),
      api.get(`/reports/submission-status?month=${month}`),
    ])
      .then(([reportData, submissionData]) => {
        setReport(reportData);
        setSubmission(submissionData);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [month]);

  async function handleSubmit() {
    setSubmitError("");
    setSubmitting(true);
    try {
      await api.post("/reports/submit", { month });
      const submissionData = await api.get(`/reports/submission-status?month=${month}`);
      setSubmission(submissionData);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const rows = report?.rows || [];
  const totalAssessed = rows.length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, rows.length);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Monthly Barangay Report</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Nutritional status breakdown for {monthLabel(month)}.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <PrintIcon /> Print Report
          </button>
          <button className="btn btn-accent" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : submission?.submitted ? "✓ Re-submit to Admin" : "📤 Submit to Admin"}
          </button>
        </div>
      </div>

      {submitError && (
        <p className="error-text" style={{ marginBottom: 12 }}>
          {submitError}
        </p>
      )}

      {submission?.submitted && (
        <div className="banner banner-success" style={{ marginBottom: 20 }}>
          ✓ Submitted to admin for {monthLabel(month)}
          {submission.submitted_at ? ` on ${new Date(submission.submitted_at).toLocaleString()}` : ""}. The admin
          can now view this barangay's {monthLabel(month)} checkup data.
        </div>
      )}
      {submission && !submission.submitted && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          ⚠ Not yet submitted — the admin cannot see this barangay's {monthLabel(month)} checkup data until you
          submit.
        </div>
      )}

      <div className="indicator-grid">
        <div className="card indicator-card">
          <div className="indicator-card-header">
            <div>
              <div className="indicator-card-title">Overview</div>
              <div className="indicator-card-abbr">This Month</div>
            </div>
          </div>
          <div className="indicator-status-row">
            <span className="indicator-status-label">
              <UsersIcon /> Total Registered
            </span>
            <span className="indicator-status-count">{loading ? "…" : report?.totalRegistered ?? 0}</span>
          </div>
          <div className="indicator-status-row">
            <span className="indicator-status-label">
              <ClipboardIcon /> Assessed This Month
            </span>
            <span className="indicator-status-count">{loading ? "…" : totalAssessed}</span>
          </div>
        </div>

        {INDICATOR_DEFS.map((def) => {
          const counts = tallyBy(rows, def.key);
          return (
            <div className="card indicator-card" key={def.key}>
              <div className="indicator-card-header">
                <div>
                  <div className="indicator-card-title">{def.label}</div>
                  <div className="indicator-card-abbr">{def.abbr}</div>
                </div>
                <div className="indicator-card-total">{loading ? "…" : totalAssessed}</div>
              </div>

              {def.statuses.map((status) => {
                const count = counts[status] || 0;
                return (
                  <div className="indicator-status-row" key={status}>
                    <span className="indicator-status-label">{status}</span>
                    <span className="indicator-status-count" style={{ color: colorVarForStatus(status) }}>
                      {loading ? "…" : count}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>Masterlist Report Data</h3>
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
                <th>Weight for Age (WFA)</th>
                <th>Height for Age (HFA)</th>
                <th>Weight for Lt/Ht (WFL/H)</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} className="loading-state">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty-state">
                    No checkups recorded for {monthLabel(month)}.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => (
                <tr key={row.assessment_id}>
                  <td>{row.purok}</td>
                  <td>{row.parent_name}</td>
                  <td style={{ fontWeight: 700 }}>{row.name}</td>
                  <td>{row.is_ip ? "YES" : "NO"}</td>
                  <td>{row.gender?.charAt(0)}</td>
                  <td>{formatShortDate(row.dob)}</td>
                  <td>{formatShortDate(row.date_measured)}</td>
                  <td>{row.weight}</td>
                  <td>{row.height}</td>
                  <td>{row.age_in_months}</td>
                  <td>
                    <StatusBadge status={row.wfa_status} compact />
                  </td>
                  <td>
                    <StatusBadge status={row.hfa_status} compact />
                  </td>
                  <td>
                    <StatusBadge status={row.wfl_h_status} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span className="pagination-info">
            {rows.length === 0 ? "No records" : `Showing ${rangeStart}–${rangeEnd} of ${rows.length}`}
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
    </div>
  );
}
