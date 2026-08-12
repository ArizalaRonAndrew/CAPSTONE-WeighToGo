import { useState } from "react";
import { api } from "../api/client";

// Shown only for barangays at High / Very High public-health significance.
// Two-step by design: "Explain with AI" just opens the panel, and a
// separate "Analyze" click is what actually spends an AI request — so
// opening the panel to read the barangay's stats never silently costs a
// Gemini call. The explainer itself is grounded in the WHO/de Onis (2018)
// reference thresholds, not an uploaded screenshot.
export default function BarangayAiPanel({ barangayName, month, severity }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (severity !== "high" && severity !== "very-high") return null;

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post("/ai/barangay-analysis", { barangay: barangayName, month });
      setResult(data.explanation);
    } catch (err) {
      setError(err.message || "AI request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="map-ai-trigger" onClick={() => setOpen(true)}>
        Explain with AI
      </button>
    );
  }

  return (
    <div className="map-ai-panel">
      <button type="button" className="map-ai-trigger" onClick={analyze} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze this barangay"}
      </button>

      {error && <div className="map-ai-error">{error}</div>}
      {result && <div className="map-ai-result">{result}</div>}
    </div>
  );
}
