const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config/ai");
const {
  classifyUnderweight,
  classifyStunting,
  classifyWasting,
  classifyOverweight,
  bandForUnderweight,
  bandForStunting,
  bandForWasting,
  bandForOverweight,
} = require("../utils/publicHealthSignificance");

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// Per-indicator grounding: the WHO definition and health-consequence facts
// the model is allowed to draw its "consequences" sentences from, so it
// isn't relying on background knowledge (or an uploaded screenshot) for
// anything but wording. Source: WHO/de Onis et al. (2018), WHO Nutrition
// Landscape Information System (apps.who.int/nutrition/landscape, help
// topic: Malnutrition in children).
const INDICATOR_INFO = {
  stunting: {
    label: "Stunting",
    definition: "height-for-age <-2 SD",
    consequence:
      "Cumulative chronic undernutrition/infection since before birth. Delays mental development, lowers school performance and adult economic productivity.",
    pctKey: "stuntedPct",
    classify: classifyStunting,
    band: bandForStunting,
  },
  wasting: {
    label: "Wasting",
    definition: "weight-for-height <-2 SD",
    consequence:
      "Acute undernutrition, usually recent food shortage or infection (esp. diarrhoea). Impairs immunity and raises risk of severe illness and death.",
    pctKey: "wastedPct",
    classify: classifyWasting,
    band: bandForWasting,
  },
  overweight: {
    label: "Overweight",
    definition: "weight-for-height >+2 SD",
    consequence:
      "Childhood obesity. Raises lifetime risk of cardiovascular disease, diabetes, musculoskeletal disorders, and certain cancers.",
    pctKey: "overweightPct",
    classify: classifyOverweight,
    band: bandForOverweight,
  },
  underweight: {
    label: "Underweight",
    definition: "weight-for-age <-2 SD, WHO/UNICEF 1995",
    consequence:
      "Composite of chronic and/or acute undernutrition (stunting and/or wasting). Mortality risk rises even at mild underweight.",
    pctKey: "underweightPct",
    classify: classifyUnderweight,
    band: bandForUnderweight,
  },
};

const TIER_RANK = { "very-low": 0, low: 1, medium: 2, high: 3, "very-high": 4 };

// The barangay's overall severity is the worst of its four indicator tiers
// (see publicHealthSignificance.worstTier) — this picks out which specific
// indicator(s) actually reached that tier, so the explanation can name and
// cite one concrete driver instead of vaguely restating the overall rating.
// Ties are broken by a fixed, arbitrary priority order (stunting > wasting >
// overweight > underweight) rather than raw percentage, since the four
// indicators use different scales and aren't directly comparable by size.
function pickDrivingIndicator(stats) {
  let best = null;
  for (const key of ["stunting", "wasting", "overweight", "underweight"]) {
    const info = INDICATOR_INFO[key];
    const pct = stats[info.pctKey];
    const tier = info.classify(pct);
    if (!best || TIER_RANK[tier] > TIER_RANK[best.tier]) {
      best = { key, info, pct, tier };
    }
  }
  return best;
}

const SYSTEM_INSTRUCTION =
  "You brief a Municipal Nutrition Action Officer (mNAO) in the Philippines on ONE child malnutrition " +
  "indicator that just crossed a WHO public-health-significance threshold in a barangay. You are given the " +
  "indicator, its prevalence rate, its WHO cutoff band, and grounding facts already computed — use them " +
  "exactly, do not recompute, second-guess, or discuss any other indicator.\n\n" +
  "Reply in plain text, in exactly this structure and order, with no headings:\n" +
  "1. One sentence stating the prevalence rate and the WHO cutoff band that reached this significance level.\n" +
  "2. 2-3 short sentences on the main health consequences of this specific indicator (drawn only from the " +
  "grounding facts given).\n" +
  "3. Exactly 2 bullet points (each starting with \"- \") with short, concrete, locally actionable mNAO steps " +
  "for this specific indicator.\n\n" +
  "Hard constraints: maximum 40 words total across the entire reply (stay well under — this is a hard ceiling " +
  "of 45, so leave margin). No introductory or concluding phrases (e.g. no \"Here is...\", no \"In summary...\"). " +
  "No greeting. Plain text only.";

// Calls Gemini's generateContent endpoint with the single WHO indicator that
// drove this barangay's significance rating (its real, server-computed
// prevalence + cutoff band), and returns a short, tightly-formatted
// explanation grounded in that one indicator only.
async function explainBarangaySignificance({ barangay, month, stats }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("AI explainer is not configured (missing GEMINI_API_KEY)");
    err.status = 503;
    throw err;
  }

  const driver = pickDrivingIndicator(stats);
  const statsText =
    `Barangay: ${barangay}\n` +
    `Month: ${month}\n` +
    `Children assessed: ${stats.totalAssessed}\n` +
    `Indicator: ${driver.info.label} (${driver.info.definition})\n` +
    `Prevalence rate: ${driver.pct.toFixed(1)}%\n` +
    `Significance tier reached: ${driver.tier}\n` +
    `WHO cutoff band for this tier: ${driver.info.band(driver.pct)}\n` +
    `Grounding facts on this indicator: ${driver.info.consequence}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: statsText }] }],
    // maxOutputTokens covers Gemini's hidden "thinking" tokens as well as the
    // visible reply — gemini-flash-latest (currently gemini-3.6-flash) spends
    // several hundred tokens reasoning before writing the answer, so a budget
    // sized only for the ~45-word reply truncates the response (MAX_TOKENS)
    // before any text comes out.
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  };

  const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || "AI request failed");
    err.status = 502;
    throw err;
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text.trim()) {
    const err = new Error("AI did not return an explanation for this barangay");
    err.status = 502;
    throw err;
  }
  return text.trim();
}

module.exports = { explainBarangaySignificance };
