import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { api } from "../../api/client";
import { currentMonth } from "../../utils/month";
import StatusBadge from "../../components/StatusBadge";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BALAYAN_CENTER = [13.9576, 120.7306];

export default function BarangayMap() {
  const [barangays, setBarangays] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    api.get("/barangays").then(setBarangays);
  }, []);

  async function selectBarangay(barangay) {
    setSelected(barangay);
    setSummaryLoading(true);
    try {
      const data = await api.get(`/reports/nutrition?month=${currentMonth()}&barangay=${encodeURIComponent(barangay.name)}`);
      setSummary(data);
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Barangay Map — Balayan, Batangas</h1>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div className="card" style={{ flex: 2, padding: 0, overflow: "hidden" }}>
          <MapContainer center={BALAYAN_CENTER} zoom={13} style={{ height: 560, width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {barangays
              .filter((b) => b.lat && b.lng)
              .map((b) => (
                <Marker key={b.name} position={[b.lat, b.lng]} eventHandlers={{ click: () => selectBarangay(b) }}>
                  <Popup>
                    <strong>{b.name}</strong>
                    <br />
                    {b.childCount} registered child{b.childCount === 1 ? "" : "ren"}
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 260 }}>
          {!selected && <p className="empty-state">Click a barangay marker to see its summary.</p>}
          {selected && (
            <>
              <h3>{selected.name}</h3>
              <div className="stat-row">
                <div className="stat-tile">
                  <div className="value">{selected.childCount}</div>
                  <div className="label">Registered children</div>
                </div>
              </div>
              {summaryLoading && <div className="loading-state">Loading summary...</div>}
              {!summaryLoading && summary && (
                <>
                  <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                    This month's assessments ({summary.totalAssessments})
                  </p>
                  {["wfa", "hfa", "wfl_h"].map((key) => (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {Object.entries(summary[key]).length === 0 && (
                          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No data</span>
                        )}
                        {Object.entries(summary[key]).map(([status, count]) => (
                          <span key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <StatusBadge status={status} /> × {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
