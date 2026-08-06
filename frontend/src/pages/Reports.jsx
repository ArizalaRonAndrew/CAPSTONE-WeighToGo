import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useBarangays } from "../hooks/useBarangays";
import { currentMonth, monthLabel } from "../utils/month";
import Dropdown from "../components/Dropdown";

// Operation Timbang Plus (OPT+) style summary rows, in the DOH form's
// standard row order for each indicator.
const GROWTH_SUMMARY_SECTIONS = [
  {
    indicator: "wfa",
    rows: [
      { status: "Normal", label: "WFA - Normal" },
      { status: "Overweight", label: "WFA - OW" },
      { status: "Underweight", label: "WFA - UW" },
      { status: "Severely Underweight", label: "WFA - SUW" },
    ],
  },
  {
    indicator: "hfa",
    rows: [
      { status: "Normal", label: "HFA - Normal" },
      { status: "Tall", label: "HFA - Tall" },
      { status: "Stunted", label: "HFA - St" },
      { status: "Severely Stunted", label: "HFA - SSt" },
    ],
  },
  {
    indicator: "wfl_h",
    rows: [
      { status: "Normal", label: "WFL/H - Normal" },
      { status: "Overweight", label: "WFL/H - OW" },
      { status: "Obese", label: "WFL/H - Ob" },
      { status: "Wasted", label: "WFL/H - MW" },
      { status: "Severely Wasted", label: "WFL/H - SW" },
    ],
  },
];

function pct(value) {
  return `${value.toFixed(1)}%`;
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

function GrowthSummaryReport({ summary }) {
  if (!summary) return null;

  const { ageBrackets, overall, indicators } = summary;

  return (
    <div className="card growth-summary-card">
      <div className="growth-summary-header">
        <div>
          <h3 className="section-title" style={{ margin: 0 }}>
            Growth Summary Report (OPT+) — {summary.barangay}
          </h3>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Nutritional status by age bracket and sex, birth to 5 years, for {monthLabel(summary.month)}.
          </p>
        </div>
        <button type="button" className="btn btn-secondary print-hide" onClick={() => window.print()}>
          <PrintIcon /> Print
        </button>
      </div>

      <div className="growth-summary-totals">
        {GROWTH_SUMMARY_SECTIONS.map((section) => (
          <div className="growth-summary-total-tile" key={section.indicator}>
            <span className="label">Total {section.indicator.toUpperCase().replace("_", "/")}</span>
            <span className="value">{indicators[section.indicator]?.totalAssessed ?? 0}</span>
          </div>
        ))}
        <div className="growth-summary-total-tile growth-summary-total-tile-overview">
          <span className="label">Total Registered</span>
          <span className="value">{summary.totalRegistered ?? 0}</span>
        </div>
        <div className="growth-summary-total-tile growth-summary-total-tile-overview">
          <span className="label">Total Assessed</span>
          <span className="value">{overall.total.total}</span>
        </div>
      </div>

      <div className="growth-summary-wrap">
        <table className="growth-summary-table">
          <colgroup>
            <col className="growth-summary-indicator-col" />
            {ageBrackets.flatMap((bracket) => [
              <col key={`${bracket.key}-boys-col`} />,
              <col key={`${bracket.key}-girls-col`} />,
              <col key={`${bracket.key}-total-col`} />,
            ])}
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className="growth-summary-row-head">
                Indicator
              </th>
              {ageBrackets.map((bracket) => (
                <th colSpan={3} key={bracket.key}>
                  {bracket.label}
                </th>
              ))}
              <th colSpan={2}>Birth to 5 Years (0-59 Mos)</th>
            </tr>
            <tr>
              {ageBrackets.flatMap((bracket) => [
                <th key={`${bracket.key}-boys`}>Boys</th>,
                <th key={`${bracket.key}-girls`}>Girls</th>,
                <th key={`${bracket.key}-total`}>Total</th>,
              ])}
              <th>Total</th>
              <th>Prev.</th>
            </tr>
          </thead>
          <tbody>
            {GROWTH_SUMMARY_SECTIONS.map((section) =>
              section.rows.map((row) => {
                const data = indicators[section.indicator]?.statuses[row.status];
                return (
                  <tr key={`${section.indicator}-${row.status}`} data-indicator={section.indicator}>
                    <td className="growth-summary-row-head">{row.label}</td>
                    {ageBrackets.flatMap((bracket) => {
                      const counts = data?.byBracket[bracket.key] || { boys: 0, girls: 0, total: 0 };
                      return [
                        <td key={`${bracket.key}-boys`}>{counts.boys}</td>,
                        <td key={`${bracket.key}-girls`}>{counts.girls}</td>,
                        <td key={`${bracket.key}-total`} className="growth-summary-subtotal">
                          {counts.total}
                        </td>,
                      ];
                    })}
                    <td className="growth-summary-subtotal">{data?.total ?? 0}</td>
                    <td>{pct(data?.prevPct ?? 0)}</td>
                  </tr>
                );
              })
            )}
            <tr className="growth-summary-total-row">
              <td className="growth-summary-row-head">Total</td>
              {ageBrackets.flatMap((bracket) => {
                const counts = overall.byBracket[bracket.key];
                return [
                  <td key={`${bracket.key}-boys`}>{counts.boys}</td>,
                  <td key={`${bracket.key}-girls`}>{counts.girls}</td>,
                  <td key={`${bracket.key}-total`}>{counts.total}</td>,
                ];
              })}
              <td>{overall.total.total}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Reports() {
  const { barangays } = useBarangays();

  const [month, setMonth] = useState(currentMonth());
  const [barangay, setBarangay] = useState("");
  const [growth, setGrowth] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (barangay) params.set("barangay", barangay);

    api
      .get(`/reports/growth-summary?${params.toString()}`)
      .then(setGrowth)
      .finally(() => setLoading(false));
  }

  useEffect(load, [month, barangay]);

  return (
    <div className="reports-page">
      <div className="page-header">
        <h1>Consolidated Reports</h1>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label>Month</label>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label>Barangay</label>
          <Dropdown
            value={barangay}
            options={[{ value: "", label: "All barangays" }, ...barangays.map((b) => ({ value: b.name, label: b.name }))]}
            onChange={setBarangay}
          />
        </div>
      </div>

      {loading && <div className="loading-state">Loading...</div>}

      {!loading && growth && <GrowthSummaryReport summary={growth} />}
    </div>
  );
}
