const { GEMINI_API_KEY } = process.env;

if (!GEMINI_API_KEY) {
  console.warn(
    "[ai] GEMINI_API_KEY is not set. Add it to backend/.env to enable the " +
      "Barangay Map AI significance explainer. Routes that call it will fail until then."
  );
}

module.exports = {
  GEMINI_API_KEY,
  GEMINI_MODEL: "gemini-3.5-flash-lite",
};
