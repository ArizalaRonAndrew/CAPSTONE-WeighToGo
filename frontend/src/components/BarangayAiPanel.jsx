import { useState } from "react";
import { api } from "../api/client";

// Shown only for barangays at High / Very High public-health significance.
// One click: "Explain with AI" opens the panel and immediately fires the
// AI request using the percentages already computed for the side panel.
export default function BarangayAiPanel({ barangayName, percentages, severity }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Covers the backend's retry cycle plus network overhead. This request is
  // read-only, so retrying cannot duplicate a data mutation.
  const AI_TIMEOUT_MS = 75000;

  if (severity !== "high" && severity !== "very-high") return null;

  async function analyze() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post(
        "/ai/barangay-analysis",
        { barangay: barangayName, percentages },
        { timeoutMs: AI_TIMEOUT_MS }
      );
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
      {error && (
        <div className="map-ai-error">
          {error}
          <button type="button" className="map-ai-trigger" onClick={analyze}>
            Try again
          </button>
        </div>
      )}
      {result && <div className="map-ai-result">{result}</div>}
    </div>
  );
}
