const { isValidMonthString } = require("../utils/date");
const { computeBarangayHealthStatus } = require("../services/barangayHealth.service");
const { explainBarangaySignificance } = require("../services/ai.service");

const HIGH_SIGNIFICANCE = new Set(["high", "very-high"]);

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

    const explanation = await explainBarangaySignificance({ barangay, month, stats });
    res.json({ barangay, month, severity: stats.severity, explanation });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeBarangaySignificance };
