import { useState } from "react";
import { api } from "../api/client";

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Shown only for barangays at High / Very High public-health significance.
// Lets the mNAO attach optional supporting screenshots and asks the backend
// AI explainer why the barangay reached that significance level, plus what
// to do about it — kept to one short request per click to limit AI cost.
export default function BarangayAiPanel({ barangayName, month, severity }) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (severity !== "high" && severity !== "very-high") return null;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setError(null);

    if (images.length + files.length > MAX_IMAGES) {
      setError(`Attach at most ${MAX_IMAGES} images`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are supported");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("Each image must be under 4MB");
        return;
      }
    }

    const dataUrls = await Promise.all(files.map(readAsDataUrl));
    setImages((prev) => [...prev, ...dataUrls.map((dataUrl, i) => ({ name: files[i].name, dataUrl }))]);
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post("/ai/barangay-analysis", {
        barangay: barangayName,
        month,
        images: images.map((img) => img.dataUrl),
      });
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
      <div className="map-ai-upload-row">
        <label htmlFor="map-ai-upload">Attach screenshots (optional, up to {MAX_IMAGES}):</label>
        <input id="map-ai-upload" type="file" accept="image/*" multiple onChange={handleFiles} />
      </div>

      {images.length > 0 && (
        <div className="map-ai-thumbs">
          {images.map((img, i) => (
            <div className="map-ai-thumb" key={img.name + i}>
              <img src={img.dataUrl} alt={img.name} />
              <button type="button" onClick={() => removeImage(i)} aria-label={`Remove ${img.name}`}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="map-ai-trigger" onClick={analyze} disabled={loading}>
        {loading ? "Analyzing..." : "Analyze this barangay"}
      </button>

      {error && <div className="map-ai-error">{error}</div>}
      {result && <div className="map-ai-result">{result}</div>}
    </div>
  );
}
