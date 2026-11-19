// Sanity bounds for anthropometric measurements: generous enough to cover
// any real under-5 child (WHO Child Growth Standards run birth-5y), tight
// enough to reject typos/garbage input (blank, "abc", a misplaced decimal,
// negative numbers) before it silently becomes a false clinical status.
const WEIGHT_RANGE = { min: 0.5, max: 40 }; // kg
const HEIGHT_RANGE = { min: 30, max: 130 }; // cm

// This program assesses children from birth through 59 months. The WHO
// reference includes a 60-month row, but children at that age are out of
// scope for this program.
const MAX_AGE_MONTHS = 59;

function parseMeasurement(value, { min, max }) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

function parseWeight(value) {
  return parseMeasurement(value, WEIGHT_RANGE);
}

function parseHeight(value) {
  return parseMeasurement(value, HEIGHT_RANGE);
}

module.exports = { parseWeight, parseHeight, WEIGHT_RANGE, HEIGHT_RANGE, MAX_AGE_MONTHS };
