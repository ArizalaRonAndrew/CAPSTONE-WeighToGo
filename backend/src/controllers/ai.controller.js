const { isValidMonthString } = require("../utils/date");
const { computeBarangayHealthStatus } = require("../services/barangayHealth.service");
const { explainBarangaySignificance } = require("../services/ai.service");

const HIGH_SIGNIFICANCE = new Set(["high", "very-high"]);

// The AI explainer addresses one specific indicator, not a generic summary
// of all four — so we deterministically pick the indicator responsible for
// the barangay's overall severity (the one whose own tier matches it),
// breaking ties by whichever has the higher prevalence. Computed in code so
// the model doesn't have to (and can't get it wrong).
function pickPrimaryIndicator(stats) {
  const candidates = [
    { key: "stunting", label: "Stunting", pct: stats.stuntedPct, tier: stats.stuntedTier },
    { key: "wasting", label: "Wasting", pct: stats.wastedPct, tier: stats.wastedTier },
    { key: "overweight", label: "Overweight", pct: stats.overweightPct, tier: stats.overweightTier },
    { key: "underweight", label: "Underweight", pct: stats.underweightPct, tier: stats.underweightTier },
  ];
  return candidates.filter((c) => c.tier === stats.severity).sort((a, b) => b.pct - a.pct)[0];
}

async function analyzeBarangaySignificance(req, res, next) {
  try {
    const { barangay, month } = req.body;
    if (!barangay || typeof barangay !== "string") {
      return res.status(400).json({ error: "barangay is required" });
    }
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }

    const barangays = await computeBarangayHealthStatus({ req, month });
    const stats = barangays.find((b) => b.barangay === barangay);
    if (!stats) {
      return res.status(404).json({ error: "Unknown barangay" });
    }
    if (!HIGH_SIGNIFICANCE.has(stats.severity)) {
      return res.status(400).json({
        error: "AI explanation is only available for barangays at High or Very High public health significance",
      });
    }

    const primary = pickPrimaryIndicator(stats);
    const explanation = await explainBarangaySignificance({ barangay, month, primary });
    res.json({ barangay, month, severity: stats.severity, indicator: primary.key, explanation });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeBarangaySignificance };
