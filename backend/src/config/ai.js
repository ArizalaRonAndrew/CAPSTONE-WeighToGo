const { GEMINI_API_KEY, GEMINI_MODEL } = process.env;

if (!GEMINI_API_KEY) {
  console.warn(
    "[ai] GEMINI_API_KEY is not set. Add it to backend/.env to enable the " +
      "Barangay Map AI significance explainer. Routes that call it will fail until then."
  );
}

module.exports = {
  GEMINI_API_KEY,
  GEMINI_MODEL: GEMINI_MODEL || "gemini-2.0-flash",
};
