import { useState } from "react";
import { api } from "../api/client";

// Shown only for barangays at High / Very High public-health significance.
// One click: "Explain with AI" opens the panel and immediately fires the
// AI request. The explainer itself is grounded in the WHO/de Onis (2018)
// reference thresholds, not an uploaded screenshot.
export default function BarangayAiPanel({ barangayName, month, severity }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (severity !== "high" && severity !== "very-high") return null;

  async function analyze() {
    setOpen(true);
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
      <button type="button" className="map-ai-trigger" onClick={analyze}>
        Explain with AI
      </button>
    );
  }

  return (
    <div className="map-ai-panel">
      {loading && <div className="map-ai-loading">Analyzing...</div>}
      {error && <div className="map-ai-error">{error}</div>}
      {result && <div className="map-ai-result">{result}</div>}
    </div>
  );
}
