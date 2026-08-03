/**
 * Approximate WHO Child Growth Standards median reference points (boys/girls,
 * 0-60 months), used to interpolate expected median weight/height for a given
 * age or height. These are commonly-cited anchor values for building a
 * percent-of-median (Gomez/Waterlow) classifier — NOT the official WHO LMS
 * tables. Before any clinical/production use, replace these anchor points
 * with the official WHO Child Growth Standards data (or NNC Operation
 * Timbang Plus reference tables).
 */

const WEIGHT_FOR_AGE_MONTHS = {
  male: [
    [0, 3.3], [3, 6.4], [6, 7.9], [9, 8.9], [12, 9.6],
    [18, 10.9], [24, 12.2], [36, 14.3], [48, 16.3], [60, 18.3],
  ],
  female: [
    [0, 3.2], [3, 5.8], [6, 7.3], [9, 8.2], [12, 8.9],
    [18, 10.2], [24, 11.5], [36, 13.9], [48, 16.1], [60, 18.2],
  ],
};

const HEIGHT_FOR_AGE_MONTHS = {
  male: [
    [0, 49.9], [3, 61.4], [6, 67.6], [9, 72.0], [12, 75.7],
    [18, 82.3], [24, 87.1], [36, 96.1], [48, 103.3], [60, 110.0],
  ],
  female: [
    [0, 49.1], [3, 59.8], [6, 65.7], [9, 70.1], [12, 74.0],
    [18, 80.7], [24, 85.7], [36, 95.1], [48, 102.7], [60, 109.4],
  ],
};

const WEIGHT_FOR_HEIGHT_CM = {
  male: [
    [50, 3.4], [55, 4.3], [60, 5.8], [65, 7.0], [70, 8.4],
    [75, 9.5], [80, 10.4], [85, 11.3], [90, 12.2], [95, 13.5],
    [100, 15.3], [105, 16.7], [110, 18.5], [115, 20.5], [120, 22.9],
  ],
  female: [
    [50, 3.3], [55, 4.2], [60, 5.6], [65, 6.8], [70, 8.1],
    [75, 9.2], [80, 10.1], [85, 11.0], [90, 11.9], [95, 13.2],
    [100, 15.0], [105, 16.4], [110, 18.2], [115, 20.2], [120, 22.6],
  ],
};

function normalizeSex(sex) {
  const value = String(sex || "").trim().toLowerCase();
  if (value.startsWith("m")) return "male";
  if (value.startsWith("f")) return "female";
  return "male";
}

function interpolate(points, x) {
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];

  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const ratio = (x - x0) / (x1 - x0);
      return y0 + ratio * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

function medianWeightForAge(sex, ageInMonths) {
  return interpolate(WEIGHT_FOR_AGE_MONTHS[normalizeSex(sex)], ageInMonths);
}

function medianHeightForAge(sex, ageInMonths) {
  return interpolate(HEIGHT_FOR_AGE_MONTHS[normalizeSex(sex)], ageInMonths);
}

function medianWeightForHeight(sex, heightCm) {
  return interpolate(WEIGHT_FOR_HEIGHT_CM[normalizeSex(sex)], heightCm);
}

module.exports = { medianWeightForAge, medianHeightForAge, medianWeightForHeight, normalizeSex };
