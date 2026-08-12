import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../../api/client";
import { currentMonth, monthLabel } from "../../utils/month";
import StatusBadge from "../../components/StatusBadge";
import BarangayAiPanel from "../../components/BarangayAiPanel";

const INDICATOR_DEFS = [
  { key: "wfa", label: "Weight-for-Age", abbr: "WFA" },
  { key: "hfa", label: "Height-for-Age", abbr: "HFA" },
  { key: "wfl_h", label: "Weight-for-Length/Height", abbr: "WFL/H" },
];

// WHO / de Onis et al. (2018) public-health-significance tiers
// (see backend/src/utils/publicHealthSignificance.js for the thresholds).
const SEVERITY_META = {
  "very-low": { label: "Very low significance", badgeClass: "badge-severity-very-low" },
  low: { label: "Low significance", badgeClass: "badge-severity-low" },
  medium: { label: "Medium significance", badgeClass: "badge-severity-medium" },
  high: { label: "High significance", badgeClass: "badge-severity-high" },
  "very-high": { label: "Very high significance", badgeClass: "badge-severity-very-high" },
  "no-data": { label: "No data this month", badgeClass: "badge-muted" },
};

const PIN_ICON_CACHE = {};

function pinIcon(severity) {
  if (PIN_ICON_CACHE[severity]) return PIN_ICON_CACHE[severity];
  const icon = L.divIcon({
    className: "barangay-pin-wrap",
    html: `
      <div class="barangay-pin barangay-pin-${severity}">
        <svg viewBox="0 0 24 34" width="28" height="40">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="currentColor"/>
          <circle cx="12" cy="12" r="4.5" fill="#fff"/>
        </svg>
      </div>
    `,
    iconSize: [28, 40],
    iconAnchor: [14, 38],
    popupAnchor: [0, -34],
    tooltipAnchor: [0, -36],
  });
  PIN_ICON_CACHE[severity] = icon;
  return icon;
}

const BALAYAN_CENTER = [13.9576, 120.7306];

function pct(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export default function BarangayMap() {
  const month = currentMonth();
  const [barangays, setBarangays] = useState([]);
  const [healthByBarangay, setHealthByBarangay] = useState({});
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get("/barangays"), api.get(`/reports/barangay-health-status?month=${month}`)]).then(
      ([barangayList, healthReport]) => {
        setBarangays(barangayList);
        const byName = {};
        for (const row of healthReport.barangays) byName[row.barangay] = row;
        setHealthByBarangay(byName);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function selectBarangay(barangay) {
    setSelected(barangay);
    setSummaryLoading(true);
    try {
      const data = await api.get(`/reports/nutrition?month=${month}&barangay=${encodeURIComponent(barangay.name)}`);
      setSummary(data);
    } finally {
      setSummaryLoading(false);
    }
  }

  const selectedHealth = selected ? healthByBarangay[selected.name] : null;
  const selectedSeverity = selectedHealth?.severity || "no-data";

  const legendItems = useMemo(
    () => [
      { severity: "very-low", label: "Very Low" },
      { severity: "low", label: "Low" },
      { severity: "medium", label: "Medium" },
      { severity: "high", label: "High" },
      { severity: "very-high", label: "Very High" },
      { severity: "no-data", label: "No data" },
    ],
    []
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Barangay Map — Balayan, Batangas</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Marker color shows each barangay's public health significance for {monthLabel(month)}, based on WHO / de
            Onis et al. (2018) prevalence thresholds for underweight, stunting, wasting, and overweight.
          </p>
        </div>
      </div>

      <div className="map-legend">
        {legendItems.map((item) => (
          <span className="map-legend-item" key={item.severity}>
            <span className={`map-legend-dot barangay-pin-${item.severity}`} />
            {item.label}
          </span>
        ))}
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
              .map((b) => {
                const health = healthByBarangay[b.name];
                const severity = health?.severity || "no-data";
                return (
                  <Marker
                    key={b.name}
                    position={[b.lat, b.lng]}
                    icon={pinIcon(severity)}
                    eventHandlers={{ click: () => selectBarangay(b) }}
                  >
                    <Tooltip direction="top" offset={[0, -34]} className="barangay-label">
                      {b.name}
                    </Tooltip>
                    <Popup>
                      <strong>{b.name}</strong>
                      <br />
                      {b.childCount} registered child{b.childCount === 1 ? "" : "ren"}
                      <br />
                      {SEVERITY_META[severity].label}
                    </Popup>
                  </Marker>
                );
              })}
          </MapContainer>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          {!selected && <p className="empty-state">Click a barangay marker to see its summary.</p>}
          {selected && (
            <>
              <div className="map-panel-header">
                <h3 style={{ margin: 0 }}>{selected.name}</h3>
                <span className={`badge ${SEVERITY_META[selectedSeverity].badgeClass}`}>
                  {SEVERITY_META[selectedSeverity].label}
                </span>
              </div>

              <div className="stat-row">
                <div className="stat-tile">
                  <div className="value">{selected.childCount}</div>
                  <div className="label">Registered children</div>
                </div>
                <div className="stat-tile">
                  <div className="value">{selectedHealth?.totalAssessed ?? 0}</div>
                  <div className="label">Assessed this month</div>
                </div>
              </div>

              {selectedHealth && selectedHealth.totalAssessed > 0 && (
                <div className="map-prevalence-row">
                  <div>
                    <div className="map-prevalence-value">{pct(selectedHealth.underweightPct)}</div>
                    <div className="map-prevalence-label">Underweight</div>
                  </div>
                  <div>
                    <div className="map-prevalence-value">{pct(selectedHealth.stuntedPct)}</div>
                    <div className="map-prevalence-label">Stunted</div>
                  </div>
                  <div>
                    <div className="map-prevalence-value">{pct(selectedHealth.wastedPct)}</div>
                    <div className="map-prevalence-label">Wasted</div>
                  </div>
                  <div>
                    <div className="map-prevalence-value">{pct(selectedHealth.overweightPct)}</div>
                    <div className="map-prevalence-label">Overweight</div>
                  </div>
                </div>
              )}

              <BarangayAiPanel key={selected.name} barangayName={selected.name} month={month} severity={selectedSeverity} />

              {summaryLoading && <div className="loading-state">Loading summary...</div>}
              {!summaryLoading && summary && (
                <>
                  <div className="section-title" style={{ marginTop: 18 }}>
                    Nutritional Status Breakdown
                  </div>
                  {INDICATOR_DEFS.map((def) => (
                    <div className="map-indicator-block" key={def.key}>
                      <div className="map-indicator-label">{def.label}</div>
                      {Object.entries(summary[def.key]).length === 0 ? (
                        <p className="empty-state" style={{ margin: 0 }}>
                          No data
                        </p>
                      ) : (
                        <div className="map-status-list">
                          {Object.entries(summary[def.key]).map(([status, count]) => (
                            <div className="map-status-row" key={status}>
                              <StatusBadge status={status} compact />
                              <span className="map-status-count">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
