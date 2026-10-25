const { explainBarangaySignificance } = require("../services/ai.service");

const PERCENTAGE_FIELDS = ["underweightPct", "stuntedPct", "wastedPct", "overweightPct"];

async function analyzeBarangaySignificance(req, res, next) {
  try {
    const { barangay, percentages } = req.body;
    if (typeof barangay !== "string" || !barangay.trim()) {
      return res.status(400).json({ error: "barangay is required" });
    }
    if (
      !percentages ||
      typeof percentages !== "object" ||
      PERCENTAGE_FIELDS.some(
        (field) => !Number.isFinite(percentages[field]) || percentages[field] < 0 || percentages[field] > 100
      )
    ) {
      return res.status(400).json({ error: "valid indicator percentages are required" });
    }

    const explanation = await explainBarangaySignificance({ barangay: barangay.trim(), percentages });
    res.json({ barangay: barangay.trim(), explanation });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeBarangaySignificance };
