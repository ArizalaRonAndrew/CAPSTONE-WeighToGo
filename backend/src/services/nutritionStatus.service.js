const { weightForAgeZ, heightForAgeZ, weightForHeightZ } = require("./growthReference");

/**
 * WHO Child Growth Standards z-score classification. Cutoffs match the WHO
 * Training Course on Child Growth Assessment / DOH Operation Timbang Plus
 * conventions used across the Philippine health system.
 */

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

function classifyNutritionStatus({ sex, ageInMonths, weightKg, heightCm }) {
  return {
    wfa_status: classifyWeightForAge(weightForAgeZ(sex, ageInMonths, weightKg)),
    hfa_status: classifyHeightForAge(heightForAgeZ(sex, ageInMonths, heightCm)),
    wfl_h_status: classifyWeightForHeight(weightForHeightZ(sex, ageInMonths, weightKg, heightCm)),
  };
}

module.exports = { classifyNutritionStatus };
