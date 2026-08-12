const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config/ai");

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// The WHO NLiS reference the app's classification is built on
// (https://apps.who.int/nutrition/landscape/help.aspx?menu=0&helpid=391),
// condensed to what the model needs to ground its explanation: what each
// indicator means, why it matters, and the exact prevalence cutoffs. This
// replaces relying on the model's own background knowledge (or an uploaded
// screenshot) with the same source of truth publicHealthSignificance.js
// codes against.
const WHO_REFERENCE =
  "WHO/de Onis et al. (2018) reference, WHO Nutrition Landscape Information System " +
  "(apps.who.int/nutrition/landscape, help topic: Malnutrition in children):\n" +
  "- Stunting (height-for-age <-2 SD): cumulative chronic undernutrition/infection since before birth; " +
  "delays mental development, lowers school performance and adult economic productivity.\n" +
  "- Wasting (weight-for-height <-2 SD): acute undernutrition, usually recent food shortage or infection " +
  "(esp. diarrhoea); impairs immunity, raises risk of severe illness and death.\n" +
  "- Overweight (weight-for-height >+2 SD): childhood obesity; raises lifetime risk of cardiovascular " +
  "disease, diabetes, musculoskeletal disorders, and certain cancers.\n" +
  "- Underweight (weight-for-age <-2 SD, WHO/UNICEF 1995): composite of stunting and/or wasting; " +
  "mortality risk rises even at mild underweight.\n" +
  "Prevalence cutoffs for public health significance (%):\n" +
  "Stunting: <2.5 very low, 2.5-<10 low, 10-<20 medium, 20-<30 high, >=30 very high.\n" +
  "Wasting & Overweight: <2.5 very low, 2.5-<5 low, 5-<10 medium, 10-<15 high, >=15 very high.\n" +
  "Underweight: <10 low, 10-<20 medium, 20-<30 high, >=30 very high.";

const SYSTEM_INSTRUCTION =
  `${WHO_REFERENCE}\n\n` +
  "You brief a Municipal Nutrition Action Officer (mNAO) in the Philippines on a barangay's child " +
  "malnutrition data, which has already been classified as 'High' or 'Very High' public health significance " +
  "using the reference above. Be EXTREMELY concise to minimize token usage: no greeting, no repeating raw " +
  "numbers beyond what's needed, no filler. Reply in plain text with exactly two short sections:\n" +
  "Why:\n- up to 3 short bullets naming which indicator(s) crossed which WHO tier and, briefly, why that " +
  "indicator matters (drawing on the reference above)\n" +
  "Do next:\n- up to 4 short, concrete, locally actionable steps for the mNAO\n" +
  "Hard cap: under 120 words total.";

// Calls Gemini's generateContent endpoint with the barangay's real
// (server-computed) prevalence stats, grounded in the WHO reference baked
// into the system instruction, and returns a short why/what-to-do
// explanation.
async function explainBarangaySignificance({ barangay, month, stats }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("AI explainer is not configured (missing GEMINI_API_KEY)");
    err.status = 503;
    throw err;
  }

  const statsText =
    `Barangay: ${barangay}\n` +
    `Month: ${month}\n` +
    `Children assessed: ${stats.totalAssessed}\n` +
    `Overall significance: ${stats.severity}\n` +
    `Underweight (WFA): ${stats.underweightPct.toFixed(1)}%\n` +
    `Stunted (HFA): ${stats.stuntedPct.toFixed(1)}%\n` +
    `Wasted (WFL/H): ${stats.wastedPct.toFixed(1)}%\n` +
    `Overweight (WFL/H): ${stats.overweightPct.toFixed(1)}%`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: statsText }] }],
    // maxOutputTokens covers Gemini's hidden "thinking" tokens as well as the
    // visible reply — gemini-flash-latest (currently gemini-3.6-flash) spends
    // several hundred tokens reasoning before writing the answer, so a budget
    // sized only for the ~120-word reply truncates the response (MAX_TOKENS)
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
