const { isValidMonthString } = require("../utils/date");
const { computeBarangayHealthStatus } = require("../services/barangayHealth.service");
const { explainBarangaySignificance } = require("../services/ai.service");

const HIGH_SIGNIFICANCE = new Set(["high", "very-high"]);
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function estimateBase64Bytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

async function analyzeBarangaySignificance(req, res, next) {
  try {
    const { barangay, month, images } = req.body;
    if (!barangay || typeof barangay !== "string") {
      return res.status(400).json({ error: "barangay is required" });
    }
    if (!isValidMonthString(month)) {
      return res.status(400).json({ error: "month is required in YYYY-MM format" });
    }
    if (images && (!Array.isArray(images) || images.length > MAX_IMAGES)) {
      return res.status(400).json({ error: `Attach at most ${MAX_IMAGES} images` });
    }
    for (const image of images || []) {
      if (typeof image !== "string" || !image.startsWith("data:image/") || estimateBase64Bytes(image) > MAX_IMAGE_BYTES) {
        return res.status(400).json({ error: "Each image must be a valid image under 4MB" });
      }
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

    const explanation = await explainBarangaySignificance({ barangay, month, stats, images });
    res.json({ barangay, month, severity: stats.severity, explanation });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyzeBarangaySignificance };
