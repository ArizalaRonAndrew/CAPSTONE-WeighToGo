// WHO prevalence-threshold classification for child malnutrition indicators
// ("public health significance"): the standard cutoffs public health bodies
// use to judge whether a population's underweight/stunting/wasting/overweight
// rate is a concern, independent of any single child's individual status.
//
// Stunting, wasting & overweight: WHO / de Onis et al. (2018) thresholds —
// https://apps.who.int/nutrition/landscape/help.aspx?menu=0&helpid=391 — a
// 5-tier scale (very low / low / medium / high / very high).
// Underweight: WHO/UNICEF 1995 thresholds (low <10%, medium 10-<20%, high
// 20-<30%, very high >=30%). de Onis 2018 does not define an underweight
// scale, so the older 4-tier classification (no "very low" band) is kept.
const STUNTING_THRESHOLDS = [
  { below: 2.5, tier: "very-low" },
  { below: 10, tier: "low" },
  { below: 20, tier: "medium" },
  { below: 30, tier: "high" },
  { below: Infinity, tier: "very-high" },
];

const WASTING_THRESHOLDS = [
  { below: 2.5, tier: "very-low" },
  { below: 5, tier: "low" },
  { below: 10, tier: "medium" },
  { below: 15, tier: "high" },
  { below: Infinity, tier: "very-high" },
];

// Same cutoffs as wasting per de Onis et al. (2018).
const OVERWEIGHT_THRESHOLDS = WASTING_THRESHOLDS;

const UNDERWEIGHT_THRESHOLDS = [
  { below: 10, tier: "low" },
  { below: 20, tier: "medium" },
  { below: 30, tier: "high" },
  { below: Infinity, tier: "very-high" },
];

function classify(pct, thresholds) {
  for (const { below, tier } of thresholds) {
    if (pct < below) return tier;
  }
  return thresholds[thresholds.length - 1].tier;
}

function classifyUnderweight(pct) {
  return classify(pct, UNDERWEIGHT_THRESHOLDS);
}

function classifyStunting(pct) {
  return classify(pct, STUNTING_THRESHOLDS);
}

function classifyWasting(pct) {
  return classify(pct, WASTING_THRESHOLDS);
}

function classifyOverweight(pct) {
  return classify(pct, OVERWEIGHT_THRESHOLDS);
}

const TIER_RANK = { "very-low": 0, low: 1, medium: 2, high: 3, "very-high": 4 };

// The worst of the indicator tiers stands for the barangay overall.
function worstTier(...tiers) {
  return tiers.reduce((worst, tier) => (TIER_RANK[tier] > TIER_RANK[worst] ? tier : worst), "very-low");
}

module.exports = {
  classifyUnderweight,
  classifyStunting,
  classifyWasting,
  classifyOverweight,
  worstTier,
  TIER_RANK,
};
