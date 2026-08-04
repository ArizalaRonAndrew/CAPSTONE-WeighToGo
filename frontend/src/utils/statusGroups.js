export const SEVERE_STATUSES = new Set(["Severely Underweight", "Severely Stunted", "Severely Wasted"]);
export const MILD_STATUSES = new Set(["Underweight", "Stunted", "Wasted"]);
export const OVER_STATUSES = new Set(["Overweight", "Obese", "Tall"]);

export const STATUS_ABBREVIATIONS = {
  Normal: "N",
  Underweight: "UW",
  "Severely Underweight": "SUW",
  Stunted: "ST",
  "Severely Stunted": "SST",
  Tall: "TALL",
  Wasted: "W",
  "Severely Wasted": "SW",
  Overweight: "OW",
  Obese: "OB",
};

export function colorVarForStatus(status) {
  if (!status) return "var(--color-primary-600)";
  if (status === "Normal") return "var(--status-normal-text)";
  if (SEVERE_STATUSES.has(status)) return "var(--status-severe-text)";
  if (MILD_STATUSES.has(status)) return "var(--status-mild-text)";
  if (OVER_STATUSES.has(status)) return "var(--status-over-text)";
  return "var(--color-primary-600)";
}
