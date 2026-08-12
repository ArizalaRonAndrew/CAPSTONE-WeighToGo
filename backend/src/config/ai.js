const { GEMINI_API_KEY, GEMINI_MODEL } = process.env;

if (!GEMINI_API_KEY) {
  console.warn(
    "[ai] GEMINI_API_KEY is not set. Add it to backend/.env to enable the " +
      "Barangay Map AI significance explainer. Routes that call it will fail until then."
  );
}

module.exports = {
  GEMINI_API_KEY,
  // "-latest" alias so this doesn't need updating every time Google
  // deprecates a dated model version. "-lite" specifically: no reasoning
  // ("thinking") tokens, which for the newer Gemini models otherwise eat
  // the whole output budget before any visible text is written — the
  // wrong tradeoff for a short, cheap explanation like this one.
  GEMINI_MODEL: GEMINI_MODEL || "gemini-flash-lite-latest",
};
