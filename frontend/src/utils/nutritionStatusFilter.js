// Shared Nutrition Status filter: one general filter matching ANY indicator
// (WFA/HFA/WFL-H), so filter bars stay compact. Group values mirror the KPI
// tiles on the masterlist pages; specific values match that status in
// whichever indicator carries it. Mirrors the backend general `status` param
// on GET /reports/monthly-masterlist/rows (see reports.model.js
// applyGeneralStatusFilter) — keep the two in sync.

export const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "normal", label: "Normal (all indicators)" },
  { value: "at-risk", label: "At-Risk / Malnourished" },
  { value: "severe", label: "Severe cases" },
  { value: "over-obese", label: "Overweight / Obese" },
  { value: "Underweight", label: "Underweight (WFA)" },
  { value: "Severely Underweight", label: "Severely Underweight (WFA)" },
  { value: "Stunted", label: "Stunted (HFA)" },
  { value: "Severely Stunted", label: "Severely Stunted (HFA)" },
  { value: "Wasted", label: "Wasted (WFL/H)" },
  { value: "Severely Wasted", label: "Severely Wasted (WFL/H)" },
  { value: "Overweight", label: "Overweight (WFA/WFL)" },
  { value: "Obese", label: "Obese (WFL/H)" },
  { value: "Tall", label: "Tall (HFA)" },
];

const AT_RISK_WFA = new Set(["Underweight", "Severely Underweight"]);
const AT_RISK_HFA = new Set(["Stunted", "Severely Stunted"]);
const AT_RISK_WFL_H = new Set(["Wasted", "Severely Wasted"]);
const SEVERE = new Set(["Severely Underweight", "Severely Stunted", "Severely Wasted"]);

// Client-side equivalent of the backend general status filter, for pages
// that already hold the full row set (e.g. the BNS monthly report).
// Row shape: { wfa_status, hfa_status, wfl_h_status }.
export function matchesNutritionStatus(row, filterValue) {
  if (!filterValue) return true;
  const wfa = row?.wfa_status;
  const hfa = row?.hfa_status;
  const wfl_h = row?.wfl_h_status;
  const key = String(filterValue).trim().toLowerCase();
  if (key === "normal") {
    return wfa === "Normal" && hfa === "Normal" && wfl_h === "Normal";
  }
  if (key === "at-risk" || key === "at_risk" || key === "malnourished") {
    return AT_RISK_WFA.has(wfa) || AT_RISK_HFA.has(hfa) || AT_RISK_WFL_H.has(wfl_h);
  }
  if (key === "severe") {
    return SEVERE.has(wfa) || SEVERE.has(hfa) || SEVERE.has(wfl_h);
  }
  if (key === "over-obese" || key === "overweight-obese" || key === "overweight/obese") {
    return wfa === "Overweight" || wfl_h === "Overweight" || wfl_h === "Obese";
  }
  const exact = String(filterValue).trim();
  return wfa === exact || hfa === exact || wfl_h === exact;
}

export function statusLabelFor(filterValue) {
  return STATUS_FILTER_OPTIONS.find((o) => o.value === filterValue)?.label || "";
}
