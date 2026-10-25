const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config/ai");

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

const SYSTEM_INSTRUCTION =
  "You are a fast, concise public-health data summarizer. Use only the supplied barangay percentages and " +
  "high-significance criteria; do not perform deep analysis, invent causes, or recalculate the values.\n\n" +
  "Briefly explain which indicator(s) meet High or Very High significance and why. Then give exactly one " +
  "simple insight based on the percentages, followed by 2-3 short, actionable intervention plans.\n" +
  "Use plain text, no introduction or conclusion, and keep the entire answer under 70 words.";

const HIGH_SIGNIFICANCE_CRITERIA =
  "High-significance criteria:\n" +
  "- Underweight: High 20% to <30%; Very High >=30% (WHO/UNICEF 1995).\n" +
  "- Stunting: High 20% to <30%; Very High >=30%.\n" +
  "- Wasting: High 10% to <15%; Very High >=15%.\n" +
  "- Overweight: High 10% to <15%; Very High >=15%.";

// Sends the frontend's already computed values directly to Gemini; no
// barangay data lookup or percentage recomputation is needed here.
async function explainBarangaySignificance({ barangay, percentages }) {
  if (!GEMINI_API_KEY) {
    const err = new Error("AI explainer is not configured (missing GEMINI_API_KEY)");
    err.status = 503;
    throw err;
  }

  const statsText =
    `Barangay: ${barangay}\n` +
    `Underweight: ${percentages.underweightPct}%\n` +
    `Stunting: ${percentages.stuntedPct}%\n` +
    `Wasting: ${percentages.wastedPct}%\n` +
    `Overweight: ${percentages.overweightPct}%\n\n` +
    HIGH_SIGNIFICANCE_CRITERIA;

  return requestExplanation(statsText);
}

function buildRequestBody(statsText) {
  return {
    model: GEMINI_MODEL,
    input: statsText,
    system_instruction: SYSTEM_INSTRUCTION,
    generation_config: {
      temperature: 0.2,
      max_output_tokens: 256,
      thinking_level: "minimal",
    },
    store: false,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-attempt cap so a hung Gemini request can't hold the Express handler
// forever. Retries extend the total only when Gemini itself is having
// a transient failure.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 20000;
// 1 live attempt + 2 retries for transient failures (rate limit / server
// errors / network or timeout).
const GEMINI_MAX_ATTEMPTS = 3;
const isTransientStatus = (status) => status === 429 || status >= 500;

async function requestExplanation(statsText) {
  let lastError = "AI request failed";
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    // Small linear backoff (2s, 4s) before each retry.
    if (attempt > 1) await sleep(2000 * (attempt - 1));
    let res;
    let data;
    try {
      res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify(buildRequestBody(statsText)),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
      data = await res.json().catch(() => null);
    } catch {
      // AbortSignal.timeout raises on a hang; reconnects and DNS failures
      // land here too. All are transient from Gemini's perspective.
      lastError = "AI request timed out or the network failed";
      continue;
    }

    if (!res.ok) {
      lastError = data?.error?.message || `AI request failed (status ${res.status})`;
      if (isTransientStatus(res.status)) continue;
      const err = new Error(lastError);
      err.status = 502;
      throw err;
    }

    const text =
      data?.steps
        ?.filter((step) => step.type === "model_output")
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("") || "";
    if (!text.trim()) {
      const err = new Error("AI did not return an explanation for this barangay");
      err.status = 502;
      throw err;
    }
    return text.trim();
  }
  const err = new Error(lastError);
  err.status = 502;
  throw err;
}

module.exports = { explainBarangaySignificance };
