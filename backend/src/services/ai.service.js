const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config/ai");

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// WHO/de Onis et al. (2018) prevalence cutoffs (WHO/UNICEF 1995 for
// underweight, which 2018 doesn't redefine) — see
// https://apps.who.int/nutrition/landscape/help.aspx?menu=0&helpid=391 and
// backend/src/utils/publicHealthSignificance.js, which this text mirrors.
// Scoped to just the flagged indicator so the model is grounded in the
// exact band the barangay's percentage falls into, without spending tokens
// on the other three indicators' cutoffs.
const INDICATOR_INFO = {
  stunting: {
    label: "Stunting",
    metric: "height-for-age",
    cutoffs: "very low <2.5%, low 2.5-<10%, medium 10-<20%, high 20-<30%, very high >=30%",
  },
  wasting: {
    label: "Wasting",
    metric: "weight-for-height",
    cutoffs: "very low <2.5%, low 2.5-<5%, medium 5-<10%, high 10-<15%, very high >=15%",
  },
  overweight: {
    label: "Overweight",
    metric: "weight-for-height",
    cutoffs: "very low <2.5%, low 2.5-<5%, medium 5-<10%, high 10-<15%, very high >=15%",
  },
  underweight: {
    label: "Underweight",
    metric: "weight-for-age",
    cutoffs: "low <10%, medium 10-<20%, high 20-<30%, very high >=30%",
  },
};

const SYSTEM_INSTRUCTION =
  "STRICT WORD LIMIT: your entire reply must be 45 words or fewer. Count as you write and cut anything past " +
  "45 words.\n\n" +
  "You brief a Municipal Nutrition Action Officer (mNAO) in the Philippines on one specific malnutrition " +
  "indicator that has been flagged at High or Very High WHO public health significance in a barangay, using " +
  "the WHO prevalence cutoffs and percentage given to you. Respond in plain text, structured as:\n" +
  "1. One short sentence (max 12 words) stating the main health consequence of this specific issue (e.g., " +
  '"Stunting leads to delayed mental development", "Wasting impairs the immune system", "Overweight leads to ' +
  'NCDs like diabetes").\n' +
  "2. Exactly 2 short bulleted actionable suggestions (max 15 words each) for the mNAO to address this " +
  "specific type of malnutrition in the barangay.\n\n" +
  "Constraints:\n" +
  "- Maximum 45 words total across the whole reply. This is a hard limit, not a target.\n" +
  '- Do NOT use introductory or concluding phrases (e.g., "Here is the analysis").\n' +
  "- Respond in plain text with bullet points for the suggestions.";

// Calls Gemini's generateContent endpoint for the one indicator responsible
// for the barangay's High/Very High significance (picked deterministically
// in ai.controller.js), grounded in the exact WHO cutoff band it falls
// into, and returns a short consequence + 2 actionable suggestions.
async function explainBarangaySignificance({ barangay, month, primary }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("AI explainer is not configured (missing GEMINI_API_KEY)");
    err.status = 503;
    throw err;
  }

  const info = INDICATOR_INFO[primary.key];
  const promptText =
    `Barangay: ${barangay}\n` +
    `Month: ${month}\n` +
    `Flagged indicator: ${info.label} (${info.metric}) = ${primary.pct.toFixed(1)}%\n` +
    `WHO cutoffs for ${info.label}: ${info.cutoffs}\n` +
    `This barangay's ${info.label} falls in the "${primary.tier}" band.`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 110 },
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
