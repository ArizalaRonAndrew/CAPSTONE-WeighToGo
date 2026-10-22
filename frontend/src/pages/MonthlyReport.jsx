import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useRevReport } from "../hooks/useRevReport";
import RefreshLine from "../components/RefreshLine";
import { currentMonth, monthLabel } from "../utils/month";
import { colorVarForStatus } from "../utils/statusGroups";
import { formatNameForTable } from "../utils/name";
import StatusBadge from "../components/StatusBadge";
import Dropdown from "../components/Dropdown";
import { STATUS_FILTER_OPTIONS, matchesNutritionStatus, statusLabelFor } from "../utils/nutritionStatusFilter";

function formatShortDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${month}-${day}-${d.getUTCFullYear()}`;
}

const INDICATOR_DEFS = [
  {
    key: "wfa_status",
    label: "Weight-for-Age",
    abbr: "WFA",
    statuses: ["Normal", "Underweight", "Severely Underweight", "Overweight"],
  },
  {
    key: "hfa_status",
    label: "Height-for-Age",
    abbr: "HFA",
    statuses: ["Normal", "Stunted", "Severely Stunted", "Tall"],
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

// Print-sheet status abbreviations (same as the admin masterlist print):
// the print columns are only ~5% wide, so full words like
// "Severely Underweight" always clip mid-word. Short codes keep every
// value on one clean line (full text stays in `title`).
const PRINT_STATUS_ABBR = {
  Normal: "Normal",
  Underweight: "UW",
  "Severely Underweight": "SUW",
  Overweight: "OW",
  Stunted: "ST",
  "Severely Stunted": "SST",
  Tall: "Tall",
  Wasted: "W",
  "Severely Wasted": "SW",
  Obese: "OB",
};

function printStatusAbbr(status) {
  if (!status) return "--";
  return PRINT_STATUS_ABBR[status] ?? status;
}

// Blank follow-up columns appended to the printed sheet (same as admin:
// Date Meas. through WFL/H). Cells stay empty for manual recording of the
// next measurement round after 3 months.
const FOLLOW_UP_COLUMNS = [
  "Date Meas.",
  "Wt (kg)",
  "Ht (cm)",
  "Age",
  "WFA",
  "HFA",
  "WFL/H",
];

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

function scrollToTopOnMobile() {
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 700px)").matches) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export default function MonthlyReport() {
  const [month, setMonth] = useState(currentMonth());
  const [submitting, setSubmitting] = useState(false);
  const [submitNotice, setSubmitNotice] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  // Print sheet state (same pattern as the admin masterlist print): the
  // filtered row set rendered into a print-only table with the same
  // layout. Kept after printing so reprints skip the rebuild.
  const [printRows, setPrintRows] = useState(null);
  const [preparingPrint, setPreparingPrint] = useState(false);

  // Rev-gated: snapshots render instantly; the heavy payloads refetch only
  // when revision counters moved server-side.
  const masterlistQuery = useRevReport(`/reports/monthly-masterlist?month=${month}`, [month]);
  const submissionQuery = useRevReport(`/reports/submission-status?month=${month}`, [month]);
  const report = masterlistQuery.data;
  const submission = submissionQuery.data;
  const loading = masterlistQuery.loading && submissionQuery.loading;
  const error = (!masterlistQuery.data && masterlistQuery.error) || "";
  const refreshing = masterlistQuery.refreshing || submissionQuery.refreshing;
  const updatedAt = Math.max(masterlistQuery.updatedAt || 0, submissionQuery.updatedAt || 0) || null;

  function refreshAll() {
    masterlistQuery.refresh();
    submissionQuery.refresh();
  }

  useEffect(() => {
    setPage(1);
  }, [month, statusFilter]);

  async function handleSubmit() {
    setSubmitError("");
    setSubmitNotice("");
    setSubmitting(true);
    // Capture the pre-call submit state so a resubmit (month already sent)
    // can get its own confirmation notice instead of looking like a first submit.
    const alreadySubmitted = !!submission?.submitted;
    try {
      const result = await api.post("/reports/submit", { month });
      if (result?._queued) {
        setSubmitNotice("Submit saved on this device — will send when you're back online.");
      } else {
        submissionQuery.refresh();
        if (alreadySubmitted) {
          setSubmitNotice(
            `✓ Resubmission complete for ${monthLabel(month)} — existing records were updated and no duplicates were created.`
          );
        }
      }
    } catch (err) {
      setSubmitError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  }

  const rows = report?.rows || [];
  const totalAssessed = rows.length;
  // The table filters client-side: this endpoint already returns the full
  // barangay-scoped row set, so no extra round trip is needed. The indicator
  // cards above always tally the full month (global summary).
  const statusLabel = statusLabelFor(statusFilter);
  const filteredRows = statusFilter ? rows.filter((row) => matchesNutritionStatus(row, statusFilter)) : rows;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rangeStart = filteredRows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredRows.length);

  function clearFilters() {
    setStatusFilter("");
    setPage(1);
  }

  // Same print flow as the admin masterlist: snapshot the filtered rows
  // into the print-only sheet (this endpoint already returns the full
  // barangay-scoped set, so no paging round trips are needed), let React
  // paint it, then print. Screen chrome stays off the paper via print CSS.
  async function handlePrint() {
    if (preparingPrint || loading) return;
    setPreparingPrint(true);
    try {
      setPrintRows(filteredRows);
      // Let React paint the print-only table before snapshotting to paper.
      await new Promise((r) => setTimeout(r, 150));
      window.print();
    } finally {
      setPreparingPrint(false);
    }
  }

  const barangayName = report?.barangay || rows[0]?.barangay || "—";

  const printDate = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Same filter header as the admin print (BNS is barangay-locked with no
  // purok/search inputs, so those boxes show the matching fixed values).
  const printFilterDetails = [
    { label: "Month", value: monthLabel(month) },
    { label: "Barangay", value: barangayName },
    { label: "Purok / Sitio", value: "All puroks" },
    { label: "Nutrition Status", value: statusFilter ? statusLabelFor(statusFilter) || statusFilter : "All statuses" },
    { label: "Search", value: "—" },
    { label: "Records", value: String(printRows?.length ?? filteredRows.length) },
    { label: "Printed", value: printDate },
  ];

  return (
    <div className="bns-monthly-report-page">
      <div className="page-header">
        <div>
          <h1>Monthly Barangay Report</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Nutritional status breakdown for {monthLabel(month)}.
          </p>
        </div>
        <div className="page-header-actions" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <button className="btn btn-secondary hide-on-mobile print-hide" onClick={handlePrint} disabled={preparingPrint || loading}>
            <PrintIcon /> {preparingPrint ? "Preparing…" : "Print Report"}
          </button>
          <button
            className="btn btn-accent"
            onClick={handleSubmit}
            disabled={submitting}
            title={
              submission?.submitted
                ? "Resubmitting won't create duplicate records — it updates or appends to the already-submitted data."
                : undefined
            }
          >
            {submitting ? (
              "Submitting..."
            ) : submission?.submitted ? (
              <>
                <SendIcon /> Resubmit
              </>
            ) : (
              <>
                <SendIcon /> Submit to Admin
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="error-text print-hide" style={{ marginBottom: 12 }}>
          {error}
        </p>
      )}
      {submitError && (
        <p className="error-text print-hide" style={{ marginBottom: 12 }}>
          {submitError}
        </p>
      )}
      {submitNotice && (
        <div className="banner banner-warning print-hide" style={{ marginBottom: 20 }}>
          {submitNotice}
        </div>
      )}

      {submission?.submitted && (
        <div className="banner banner-success print-hide" style={{ marginBottom: 20 }}>
          <div>
            <div>✓ Submission complete for {monthLabel(month)} — the admin can now view this barangay&apos;s {monthLabel(month)} checkup data.</div>
            <div style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>
              Note: Resubmitting this month will not create duplicate records — it simply updates the existing
              entries or appends any new checkups you&apos;ve recorded since the last submission.
            </div>
          </div>
        </div>
      )}
      {submission && !submission.submitted && (
        <div className="banner banner-warning print-hide" style={{ marginBottom: 20 }}>
          ⚠ Not yet submitted — the admin cannot see this barangay&apos;s {monthLabel(month)} checkup data until you
          submit.
        </div>
      )}

      {!loading && (
        <div className="print-hide">
          <RefreshLine refreshing={refreshing} updatedAt={updatedAt} onRefresh={refreshAll} />
        </div>
      )}

      <div className="indicator-grid print-hide">
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

      <div className="card bns-screen-card">
        <h3>Masterlist Report Data</h3>
        <div className="card filter-card" style={{ marginBottom: 16 }}>
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <div className="field">
              <label>Nutrition Status</label>
              <Dropdown value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
            </div>
            {statusFilter && (
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
        {!loading && statusFilter && (
          <p className="results-count">
            {filteredRows.length} match{filteredRows.length === 1 ? "" : "es"} with status “{statusLabel}”
          </p>
        )}
        <div className="table-wrap">
          <table className="masterlist-table">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
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
              {!loading && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty-state">
                    <div>No checkups match your filters.</div>
                    <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={clearFilters}>
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}
              {pageRows.map((row) => (
                <tr key={row.assessment_id}>
                  <td data-label="Address / Purok">{row.purok}</td>
                  <td data-label="Mother / Caregiver">{row.parent_name}</td>
                  <td data-label="Name of Child" style={{ fontWeight: 700 }}>{formatNameForTable(row.name)}</td>
                  <td data-label="IP Group">{row.is_ip ? "YES" : "NO"}</td>
                  <td data-label="Sex">{row.gender?.charAt(0)}</td>
                  <td data-label="Date of Birth">{formatShortDate(row.dob)}</td>
                  <td data-label="Date Measured">{formatShortDate(row.date_measured)}</td>
                  <td data-label="Weight (kg)">{row.weight}</td>
                  <td data-label="Height (cm)">{row.height}</td>
                  <td data-label="Age (mos)">{row.age_in_months}</td>
                  <td data-label="Weight for Age (WFA)">
                    <StatusBadge status={row.wfa_status} compact />
                  </td>
                  <td data-label="Height for Age (HFA)">
                    <StatusBadge status={row.hfa_status} compact />
                  </td>
                  <td data-label="Weight for Lt/Ht (WFL/H)">
                    <StatusBadge status={row.wfl_h_status} compact />
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
              onClick={() => { setPage((p) => Math.max(1, p - 1)); scrollToTopOnMobile(); }}
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
              onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); scrollToTopOnMobile(); }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {printRows && (
        <div className="masterlist-print">
          <h1>Masterlist — {barangayName}</h1>
          <div className="ml-print-filters">
            {printFilterDetails.map((item) => (
              <div className="ml-print-filter" key={item.label}>
                <span className="ml-print-filter-label">{item.label}</span>
                <span className="ml-print-filter-value">{item.value}</span>
              </div>
            ))}
          </div>
          <p className="ml-print-note">
            Blank follow-up columns are for manual recording of the next measurement round after 3 months.
          </p>
          <p className="ml-print-legend">
            Status codes: UW = Underweight, SUW = Severely Underweight, OW = Overweight, ST = Stunted, SST =
            Severely Stunted, W = Wasted, SW = Severely Wasted, OB = Obese.
          </p>
          <table className="ml-print-table">
            <colgroup>
              <col className="ml-col-num" />
              <col className="ml-col-place" />
              <col className="ml-col-name" />
              <col className="ml-col-name" />
              <col className="ml-col-flag" />
              <col className="ml-col-flag" />
              <col className="ml-col-date" />
              <col className="ml-col-date" />
              <col className="ml-col-measure" />
              <col className="ml-col-measure" />
              <col className="ml-col-flag" />
              <col className="ml-col-status" />
              <col className="ml-col-status" />
              <col className="ml-col-status" />
              <col className="ml-col-date ml-col-blank" />
              <col className="ml-col-measure ml-col-blank" />
              <col className="ml-col-measure ml-col-blank" />
              <col className="ml-col-flag ml-col-blank" />
              <col className="ml-col-status ml-col-blank" />
              <col className="ml-col-status ml-col-blank" />
              <col className="ml-col-status ml-col-blank" />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>#</th>
                <th rowSpan={2}>Address / Purok</th>
                <th rowSpan={2}>Mother / Caregiver</th>
                <th rowSpan={2}>Name of Child</th>
                <th rowSpan={2}>IP</th>
                <th rowSpan={2}>Sex</th>
                <th rowSpan={2}>Birth Date</th>
                <th colSpan={7}>Current — {monthLabel(month)}</th>
                <th colSpan={7}>Follow-up (after 3 months)</th>
              </tr>
              <tr>
                <th>Date Meas.</th>
                <th>Wt (kg)</th>
                <th>Ht (cm)</th>
                <th>Age</th>
                <th>WFA</th>
                <th>HFA</th>
                <th>WFL/H</th>
                <th>Date Meas.</th>
                <th>Wt (kg)</th>
                <th>Ht (cm)</th>
                <th>Age</th>
                <th>WFA</th>
                <th>HFA</th>
                <th>WFL/H</th>
              </tr>
            </thead>
            <tbody>
              {printRows.length === 0 && (
                <tr>
                  <td colSpan={21} className="ml-print-empty">
                    No checkups recorded for {monthLabel(month)} under the current filters.
                  </td>
                </tr>
              )}
              {printRows.map((row, index) => (
                <tr key={row.assessment_id}>
                  <td className="ml-print-num">{index + 1}</td>
                  <td>
                    <div className="ml-print-barangay">{row.barangay}</div>
                    <div>{row.purok}</div>
                  </td>
                  <td>{formatNameForTable(row.parent_name)}</td>
                  <td>{formatNameForTable(row.name)}</td>
                  <td className="ml-print-center">{row.is_ip ? "YES" : "NO"}</td>
                  <td className="ml-print-center">{row.gender?.charAt(0)}</td>
                  <td className="ml-print-center">{formatShortDate(row.dob)}</td>
                  <td className="ml-print-center">{formatShortDate(row.date_measured)}</td>
                  <td className="ml-print-center">{row.weight}</td>
                  <td className="ml-print-center">{row.height}</td>
                  <td className="ml-print-center">{row.age_in_months}</td>
                  <td className="ml-print-status" title={row.wfa_status}>
                    {printStatusAbbr(row.wfa_status)}
                  </td>
                  <td className="ml-print-status" title={row.hfa_status}>
                    {printStatusAbbr(row.hfa_status)}
                  </td>
                  <td className="ml-print-status" title={row.wfl_h_status}>
                    {printStatusAbbr(row.wfl_h_status)}
                  </td>
                  {FOLLOW_UP_COLUMNS.map((col) => (
                    <td key={col} className="ml-blank">
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
