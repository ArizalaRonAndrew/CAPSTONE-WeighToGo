import { useEffect, useState } from "react";
import { api } from "../api/client";
import { currentMonth } from "../utils/month";
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Monthly Barangay Report</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Summary of nutritional cases for the selected month.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button className="btn btn-info" onClick={() => window.print()}>
            🖨 Print Report
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

      <div className="stat-row">
        <div className="card kpi-tile">
          <div className="kpi-icon kpi-icon-neutral">👤</div>
          <div>
            <div className="kpi-label">Total Registered</div>
            <div className="kpi-value">{loading ? "…" : report?.totalRegistered ?? 0}</div>
          </div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-icon kpi-icon-normal">✓</div>
          <div>
            <div className="kpi-label">Normal (All Metrics)</div>
            <div className="kpi-value">{loading ? "…" : report?.normal ?? 0}</div>
          </div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-icon kpi-icon-severe">⚠</div>
          <div>
            <div className="kpi-label">Malnourished / Stunted</div>
            <div className="kpi-value">{loading ? "…" : report?.malnourishedStunted ?? 0}</div>
          </div>
        </div>
        <div className="card kpi-tile">
          <div className="kpi-icon kpi-icon-over">🍔</div>
          <div>
            <div className="kpi-label">Obese</div>
            <div className="kpi-value">{loading ? "…" : report?.obese ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Masterlist Report Data</h3>
        <div className="table-wrap">
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
              {rows.map((row) => (
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
      </div>
    </div>
  );
}
