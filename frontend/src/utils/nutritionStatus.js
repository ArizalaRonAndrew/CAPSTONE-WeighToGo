import { weightForAgeZ, heightForAgeZ, weightForHeightZ } from "./growthReference.js";

// On-device mirror of backend/src/services/nutritionStatus.service.js +
// the age math in backend/src/utils/date.js, so the BNS sees the computed
// status the moment weight/height are typed even with no signal. Online the
// server remains authoritative; this only fills the preview offline.
// Verified equivalent by the offline-status simulation test.

export const WEIGHT_RANGE = { min: 0.5, max: 40 }; // kg
export const HEIGHT_RANGE = { min: 30, max: 130 }; // cm
export const MAX_AGE_MONTHS = 60;

function classifyWeightForAge(z) {
  if (z < -3) return "Severely Underweight";
  if (z < -2) return "Underweight";
  if (z > 2) return "Overweight";
  return "Normal";
}

function classifyHeightForAge(z) {
  if (z < -3) return "Severely Stunted";
  if (z < -2) return "Stunted";
  if (z > 2) return "Tall";
  return "Normal";
}

function classifyWeightForHeight(z) {
  if (z < -3) return "Severely Wasted";
  if (z < -2) return "Wasted";
  if (z <= 2) return "Normal";
  if (z <= 3) return "Overweight";
  return "Obese";
}

function partsOf(dateStr) {
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

export function calculateAgeInMonths(dob, referenceDate) {
  const birth = partsOf(dob);
  const ref = partsOf(referenceDate);
  let months = (ref.year - birth.year) * 12 + (ref.month - birth.month);
  if (ref.day < birth.day) months -= 1;
  return Math.max(months, 0);
}

function inRange(value, { min, max }) {
  const num = Number(value);
  return Number.isFinite(num) && num >= min && num <= max;
}

// Returns { wfa_status, hfa_status, wfl_h_status } or null when the inputs
// are outside measurable range / program scope (mirrors server rejection).
export function classifyNutritionStatusLocal({ sex, dob, dateMeasured, weightKg, heightCm }) {
  if (!inRange(weightKg, WEIGHT_RANGE) || !inRange(heightCm, HEIGHT_RANGE)) return null;
  const ageInMonths = calculateAgeInMonths(dob, dateMeasured);
  if (ageInMonths > MAX_AGE_MONTHS) return null;
  return {
    wfa_status: classifyWeightForAge(weightForAgeZ(sex, ageInMonths, Number(weightKg))),
    hfa_status: classifyHeightForAge(heightForAgeZ(sex, ageInMonths, Number(heightCm))),
    wfl_h_status: classifyWeightForHeight(weightForHeightZ(sex, ageInMonths, Number(weightKg), Number(heightCm))),
    age_in_months: ageInMonths,
  };
}
