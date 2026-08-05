// WHO prevalence-threshold classification for child malnutrition indicators
// ("public health significance"): the standard cutoffs public health bodies
// use to judge whether a population's underweight/stunting/wasting rate is a
// concern, independent of any single child's individual status.
// Underweight & stunting: WHO/UNICEF 1995 thresholds (low <10%, medium
// 10-<20%, high 20-<30%, very high >=30%).
// Wasting: WHO 2018 thresholds, more sensitive because acute malnutrition
// moves faster (low <5%, medium 5-<10%, high 10-<15%, very high >=15%).
// "High" and "very high" are collapsed into one "high" tier here since the
// map only needs a 3-color (green/yellow/red) signal.
const UNDERWEIGHT_STUNTING_THRESHOLDS = [
  { below: 10, tier: "low" },
  { below: 20, tier: "medium" },
  { below: Infinity, tier: "high" },
];

const WASTING_THRESHOLDS = [
  { below: 5, tier: "low" },
  { below: 10, tier: "medium" },
  { below: Infinity, tier: "high" },
];

function classify(pct, thresholds) {
  for (const { below, tier } of thresholds) {
    if (pct < below) return tier;
  }
  return "high";
}

function classifyUnderweight(pct) {
  return classify(pct, UNDERWEIGHT_STUNTING_THRESHOLDS);
}

function classifyStunting(pct) {
  return classify(pct, UNDERWEIGHT_STUNTING_THRESHOLDS);
}

function classifyWasting(pct) {
  return classify(pct, WASTING_THRESHOLDS);
}

const TIER_RANK = { low: 0, medium: 1, high: 2 };

// The worst of the three indicator tiers stands for the barangay overall.
function worstTier(...tiers) {
  return tiers.reduce((worst, tier) => (TIER_RANK[tier] > TIER_RANK[worst] ? tier : worst), "low");
}

module.exports = { classifyUnderweight, classifyStunting, classifyWasting, worstTier };
