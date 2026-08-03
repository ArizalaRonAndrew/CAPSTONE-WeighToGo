const { medianWeightForAge, medianHeightForAge, medianWeightForHeight } = require("./growthReference");

/**
 * Percent-of-median classification (Gomez for weight-for-age, Waterlow for
 * height-for-age and weight-for-height). See growthReference.js for the
 * caveat on the underlying reference data.
 */

function classifyWeightForAge(weightKg, sex, ageInMonths) {
  const median = medianWeightForAge(sex, ageInMonths);
  const percent = (weightKg / median) * 100;
  if (percent >= 90) return "Normal";
  if (percent >= 75) return "Underweight";
  return "Severely Underweight";
}

function classifyHeightForAge(heightCm, sex, ageInMonths) {
  const median = medianHeightForAge(sex, ageInMonths);
  const percent = (heightCm / median) * 100;
  if (percent >= 95) return "Normal";
  if (percent >= 90) return "Stunted";
  return "Severely Stunted";
}

function classifyWeightForHeight(weightKg, heightCm, sex) {
  const median = medianWeightForHeight(sex, heightCm);
  const percent = (weightKg / median) * 100;
  if (percent > 120) return "Obese";
  if (percent > 110) return "Overweight";
  if (percent >= 90) return "Normal";
  if (percent >= 80) return "Wasted";
  return "Severely Wasted";
}

function classifyNutritionStatus({ sex, ageInMonths, weightKg, heightCm }) {
  return {
    wfa_status: classifyWeightForAge(weightKg, sex, ageInMonths),
    hfa_status: classifyHeightForAge(heightCm, sex, ageInMonths),
    wfl_h_status: classifyWeightForHeight(weightKg, heightCm, sex),
  };
}

module.exports = { classifyNutritionStatus };
