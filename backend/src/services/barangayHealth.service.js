const reportsModel = require("../models/reports.model");
const barangayModel = require("../models/barangay.model");
const { toMonthRange } = require("../utils/date");
const { filterSubmittedForRole } = require("../utils/submission");
const {
  classifyUnderweight,
  classifyStunting,
  classifyWasting,
  classifyOverweight,
  worstTier,
} = require("../utils/publicHealthSignificance");

const MALNOURISHED_WFA = new Set(["Underweight", "Severely Underweight"]);
const STUNTED_HFA = new Set(["Stunted", "Severely Stunted"]);
const WASTED_WFL_H = new Set(["Wasted", "Severely Wasted"]);
const OVERWEIGHT_WFL_H = new Set(["Overweight", "Obese"]);

// Per-barangay underweight/stunted/wasted/overweight prevalence for the
// month, each classified against WHO's public-health-significance
// thresholds. Shared by the Barangay Map (color-coded markers + side panel)
// and the AI significance explainer, so both work off the same real data
// instead of trusting client-supplied numbers.
async function computeBarangayHealthStatus({ req, month }) {
  const { start, end } = toMonthRange(month);
  const allRows = await reportsModel.fetchAssessmentsWithBarangay({ start, end });
  const rows = filterSubmittedForRole(req, allRows);

  const totals = new Map();
  for (const b of barangayModel.getAll()) {
    totals.set(b.name, {
      barangay: b.name,
      totalAssessed: 0,
      underweight: 0,
      stunted: 0,
      wasted: 0,
      overweight: 0,
    });
  }

  for (const row of rows) {
    const barangay = row.tbl_children?.barangay;
    const bucket = totals.get(barangay);
    if (!bucket) continue;
    bucket.totalAssessed += 1;
    if (MALNOURISHED_WFA.has(row.wfa_status)) bucket.underweight += 1;
    if (STUNTED_HFA.has(row.hfa_status)) bucket.stunted += 1;
    if (WASTED_WFL_H.has(row.wfl_h_status)) bucket.wasted += 1;
    if (OVERWEIGHT_WFL_H.has(row.wfl_h_status)) bucket.overweight += 1;
  }

  return Array.from(totals.values()).map((b) => {
    if (b.totalAssessed === 0) {
      return {
        ...b,
        underweightPct: 0,
        stuntedPct: 0,
        wastedPct: 0,
        overweightPct: 0,
        severity: "no-data",
      };
    }
    const underweightPct = (b.underweight / b.totalAssessed) * 100;
    const stuntedPct = (b.stunted / b.totalAssessed) * 100;
    const wastedPct = (b.wasted / b.totalAssessed) * 100;
    const overweightPct = (b.overweight / b.totalAssessed) * 100;
    const severity = worstTier(
      classifyUnderweight(underweightPct),
      classifyStunting(stuntedPct),
      classifyWasting(wastedPct),
      classifyOverweight(overweightPct)
    );
    return { ...b, underweightPct, stuntedPct, wastedPct, overweightPct, severity };
  });
}

module.exports = { computeBarangayHealthStatus };
