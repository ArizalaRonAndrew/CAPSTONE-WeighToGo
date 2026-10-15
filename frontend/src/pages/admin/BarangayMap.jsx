import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { currentMonth, monthLabel } from "../../utils/month";
import { useRevReport, loadRevGated } from "../../hooks/useRevReport";
import RefreshLine from "../../components/RefreshLine";
import StatusBadge from "../../components/StatusBadge";
import BarangayAiPanel from "../../components/BarangayAiPanel";
import Dropdown from "../../components/Dropdown";

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

const INDICATOR_FILTER_OPTIONS = [
  { value: "overall", label: "Overall significance" },
  { value: "underweight", label: "Underweight" },
  { value: "stunted", label: "Stunted" },
  { value: "wasted", label: "Wasted" },
  { value: "overweight", label: "Overweight" },
];

// Prevalence keys on each barangay-health-status row, per filter value.
const INDICATOR_PCT_KEY = {
  underweight: "underweightPct",
  stunted: "stuntedPct",
  wasted: "wastedPct",
  overweight: "overweightPct",
};

const INDICATOR_SHORT_LABEL = {
  overall: "Overall",
  underweight: "Underweight",
  stunted: "Stunted",
  wasted: "Wasted",
  overweight: "Overweight",
};

const SEVERITY_SHORT_LABEL = {
  "very-low": "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  "very-high": "Very high",
  "no-data": "No data",
};

// Client-side mirror of backend/src/utils/publicHealthSignificance.js so the
// map can recolor pins per indicator without another round trip. Keep the
// cutoffs in sync with the backend (WHO / de Onis et al. 2018; underweight
// uses the older WHO/UNICEF 1995 4-tier scale with no "very low" band).
function classifyUnderweight(pct) {
  if (pct < 10) return "low";
  if (pct < 20) return "medium";
  if (pct < 30) return "high";
  return "very-high";
}

function classifyStunting(pct) {
  if (pct < 2.5) return "very-low";
  if (pct < 10) return "low";
  if (pct < 20) return "medium";
  if (pct < 30) return "high";
  return "very-high";
}

function classifyWastingOrOverweight(pct) {
  if (pct < 2.5) return "very-low";
  if (pct < 5) return "low";
  if (pct < 10) return "medium";
  if (pct < 15) return "high";
  return "very-high";
}

// Severity tier to display for a barangay under the active indicator filter.
// "overall" falls back to the backend-computed worst-tier severity.
function severityForIndicator(health, filter) {
  if (!health || !health.totalAssessed) return "no-data";
  if (!filter || filter === "overall") return health.severity || "no-data";
  const pct = Number(health[INDICATOR_PCT_KEY[filter]] ?? 0);
  if (filter === "underweight") return classifyUnderweight(pct);
  if (filter === "stunted") return classifyStunting(pct);
  return classifyWastingOrOverweight(pct);
}

function pinIcon(severity) {
  if (PIN_ICON_CACHE[severity]) return PIN_ICON_CACHE[severity];
  const icon = L.divIcon({
    className: "barangay-pin-wrap",
    html: `
      <div class="barangay-pin barangay-pin-${severity}">
        <svg viewBox="0 0 24 34" width="32" height="45">
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="currentColor"/>
          <circle cx="12" cy="12" r="4.5" fill="#fff"/>
        </svg>
      </div>
    `,
    iconSize: [32, 45],
    iconAnchor: [16, 43],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -40],
  });
  PIN_ICON_CACHE[severity] = icon;
  return icon;
}

const BALAYAN_CENTER = [13.9576, 120.7306];

function pct(value) {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

export default function BarangayMap() {
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [indicatorFilter, setIndicatorFilter] = useState("overall");

  // Rev-gated: cached map data paints instantly; the two month scans refetch
  // only when revision counters moved server-side.
  const barangaysQuery = useRevReport("/barangays", [month]);
  const healthQuery = useRevReport(`/reports/barangay-health-status?month=${month}`, [month]);
  const barangays = barangaysQuery.data || [];
  const healthByBarangay = useMemo(() => {
    const byName = {};
    for (const row of healthQuery.data?.barangays || []) byName[row.barangay] = row;
    return byName;
  }, [healthQuery.data]);
  const mapError =
    (!barangaysQuery.data && barangaysQuery.error) || (!healthQuery.data && healthQuery.error) || "";
  const mapRefreshing = barangaysQuery.refreshing || healthQuery.refreshing;
  const mapUpdatedAt = Math.max(barangaysQuery.updatedAt || 0, healthQuery.updatedAt || 0) || null;

  function refreshAll() {
    barangaysQuery.refresh();
    healthQuery.refresh();
  }

  useEffect(() => {
    setSelected(null);
    setSummary(null);
    setSummaryError("");
  }, [month]);

  async function selectBarangay(barangay) {
    setSelected(barangay);
    // Clear the previous barangay's summary immediately — otherwise, if this
    // fetch fails, the old summary keeps rendering underneath the new
    // barangay's name/header, misattributing one barangay's data to another.
    setSummary(null);
    setSummaryError("");
    setSummaryLoading(true);
    try {
      // One-shot rev-gated fetch: cached barangay summaries skip the network.
      const { body } = await loadRevGated(
        `/reports/nutrition?month=${month}&barangay=${encodeURIComponent(barangay.name)}`,
        [month]
      );
      setSummary(body);
    } catch (err) {
      setSummaryError(err.message || "Failed to load this barangay's summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  const selectedHealth = selected ? healthByBarangay[selected.name] : null;
  const selectedSeverity = selectedHealth?.severity || "no-data";
  // Pin/panel classification under the active indicator filter. The AI
  // explainer stays gated on the overall (worst-tier) severity.
  const selectedDisplaySeverity = severityForIndicator(selectedHealth, indicatorFilter);
  const activeIndicatorLabel = INDICATOR_SHORT_LABEL[indicatorFilter] || "Overall";

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
            {indicatorFilter === "overall"
              ? `Marker color shows each barangay's overall public health significance for ${monthLabel(month)} (worst of underweight, stunting, wasting, and overweight), based on WHO / de Onis et al. (2018) prevalence thresholds.`
              : `Marker color shows each barangay's ${activeIndicatorLabel.toLowerCase()} significance for ${monthLabel(month)}, based on WHO / de Onis et al. (2018) prevalence thresholds.`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label>Indicator</label>
            <Dropdown value={indicatorFilter} options={INDICATOR_FILTER_OPTIONS} onChange={setIndicatorFilter} />
          </div>
          <div className="field">
            <label htmlFor="map-month">Month</label>
            <input
              id="map-month"
              className="input"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
        </div>
      </div>

      {mapError && (
        <div className="banner banner-warning" style={{ marginBottom: 20 }}>
          {mapError}{" "}
          <button type="button" className="btn btn-sm" onClick={refreshAll}>
            Retry
          </button>
        </div>
      )}

      <RefreshLine refreshing={mapRefreshing} updatedAt={mapUpdatedAt} onRefresh={refreshAll} />

      <div className="map-legend">
        <span className="map-legend-item" style={{ color: "var(--color-text)" }}>
          Showing: <strong style={{ marginLeft: 4 }}>{activeIndicatorLabel}</strong>
        </span>
        <span className="map-legend-item" aria-hidden="true" style={{ opacity: 0.4 }}>
          |
        </span>
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
                const severity = severityForIndicator(health, indicatorFilter);
                const indicatorPct =
                  indicatorFilter === "overall" ? null : health?.[INDICATOR_PCT_KEY[indicatorFilter]];
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
                      {indicatorFilter === "overall" ? (
                        SEVERITY_META[severity].label
                      ) : (
                        <>
                          {activeIndicatorLabel} {indicatorPct != null ? pct(indicatorPct) : "—"} —{" "}
                          {SEVERITY_META[severity].label}
                        </>
                      )}
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
                <span className={`badge ${SEVERITY_META[selectedDisplaySeverity].badgeClass}`}>
                  {indicatorFilter === "overall"
                    ? SEVERITY_META[selectedDisplaySeverity].label
                    : `${activeIndicatorLabel}: ${SEVERITY_META[selectedDisplaySeverity].label}`}
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
                  {[
                    { key: "underweight", label: "Underweight", pctKey: "underweightPct" },
                    { key: "stunted", label: "Stunted", pctKey: "stuntedPct" },
                    { key: "wasted", label: "Wasted", pctKey: "wastedPct" },
                    { key: "overweight", label: "Overweight", pctKey: "overweightPct" },
                  ].map((item) => {
                    const tier = severityForIndicator(selectedHealth, item.key);
                    const isActive = indicatorFilter === item.key;
                    return (
                      <div
                        key={item.key}
                        className={isActive ? "map-prevalence-cell-active" : undefined}
                        style={isActive ? { padding: "6px 4px", margin: "-7px -5px" } : undefined}
                      >
                        <div className="map-prevalence-value">{pct(selectedHealth[item.pctKey])}</div>
                        <div className="map-prevalence-label">{item.label}</div>
                        <span
                          className={`badge ${SEVERITY_META[tier].badgeClass}`}
                          style={{ marginTop: 6, fontSize: 10, padding: "2px 8px" }}
                        >
                          {SEVERITY_SHORT_LABEL[tier]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <BarangayAiPanel key={selected.name} barangayName={selected.name} month={month} severity={selectedSeverity} />

              {summaryLoading && <div className="loading-state">Loading summary...</div>}
              {!summaryLoading && summaryError && (
                <div className="banner banner-warning" style={{ marginTop: 18 }}>
                  {summaryError}{" "}
                  <button type="button" className="btn btn-sm" onClick={() => selectBarangay(selected)}>
                    Retry
                  </button>
                </div>
              )}
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
