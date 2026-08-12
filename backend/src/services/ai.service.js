const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config/ai");

const GEMINI_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_INSTRUCTION =
  "You brief a Municipal Nutrition Action Officer (mNAO) in the Philippines on why a barangay's child " +
  "malnutrition prevalence reached WHO 'High' or 'Very High' public health significance, using the WHO/de " +
  "Onis (2018) prevalence thresholds for stunting, wasting and overweight (WHO/UNICEF 1995 thresholds for " +
  "underweight). Be EXTREMELY concise to minimize token usage: no greeting, no repeating the raw numbers " +
  "verbatim beyond what's needed, no filler. Reply in plain text with exactly two short sections:\n" +
  "Why:\n- up to 3 short bullets naming which indicator(s) crossed which WHO tier\n" +
  "Do next:\n- up to 4 short, concrete, locally actionable steps for the mNAO\n" +
  "Hard cap: under 120 words total.";

function stripDataUrlPrefix(dataUrl) {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

// Calls Gemini's multimodal generateContent endpoint with the barangay's
// real (server-computed) prevalence stats plus any mNAO-supplied
// screenshots, and returns a short why/what-to-do explanation.
async function explainBarangaySignificance({ barangay, month, stats, images = [] }) {
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

  const parts = [{ text: statsText }];
  for (const image of images) {
    const parsed = stripDataUrlPrefix(image);
    if (parsed) parts.push({ inlineData: parsed });
  }

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 220 },
  };

  const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || "AI request failed");
    err.status = res.status >= 400 && res.status < 500 ? 502 : 502;
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
