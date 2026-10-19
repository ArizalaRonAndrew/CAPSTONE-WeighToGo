import { useMemo, useEffect, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBarangays } from "../../hooks/useBarangays";
import { useRevReport } from "../../hooks/useRevReport";
import RefreshLine from "../../components/RefreshLine";
import { currentMonth, addMonths, periodKeyForMonth } from "../../utils/month";
import Dropdown from "../../components/Dropdown";

const INDICATOR_OPTIONS = [
  { value: "wfa", label: "Weight-for-Age" },
  { value: "hfa", label: "Height-for-Age" },
  { value: "wfl_h", label: "Weight-for-Height" },
];

const STATUS_OPTIONS = {
  wfa: ["Normal", "Underweight", "Severely Underweight", "Overweight"],
  hfa: ["Normal", "Stunted", "Severely Stunted", "Tall"],
  wfl_h: ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"],
};

const STATUS_COLORS = {
  Normal: "#16803c",
  Underweight: "#c17a00",
  "Severely Underweight": "#b42318",
  Overweight: "#2166ac",
  Stunted: "#7b4ab3",
  "Severely Stunted": "#8c2d5e",
  Tall: "#008a8a",
  Wasted: "#d55e00",
  "Severely Wasted": "#6b3f24",
  Obese: "#4f46a5",
};

function lineSeriesColor(status) {
  return STATUS_COLORS[status] || "#285a48";
}

function trendRowTotal(row, statuses) {
  if (!row) return 0;
  return statuses.reduce((sum, s) => sum + (row[s] || 0), 0);
}

const BAR_INDICATORS = [
  { key: "wfa", label: "WFA" },
  { key: "hfa", label: "HFA" },
  { key: "wfl_h", label: "WFL/H" },
];

function BarangayIssueTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "var(--shadow-md)",
        fontSize: 12.5,
        minWidth: 170,
      }}
    >
      <div
        style={{ fontWeight: 700, color: "var(--color-text)", marginBottom: 6 }}
      >
        {row.barangay}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          color: "var(--color-text-muted)",
        }}
      >
        <span>Children with an issue</span>
        <span style={{ fontWeight: 700, color: "var(--color-text)" }}>
          {row.count}
        </span>
      </div>
      {BAR_INDICATORS.map(({ key, label }) => {
        const entries = STATUS_OPTIONS[key]
          .filter((s) => s !== "Normal")
          .map((status) => [status, row.breakdown?.[key]?.[status] || 0])
          .filter(([, count]) => count > 0);
        if (entries.length === 0) return null;
        return (
          <div
            key={key}
            style={{
              marginTop: 6,
              paddingTop: 6,
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "var(--color-text-muted)",
                fontSize: 11,
                marginBottom: 2,
              }}
            >
              {label}
            </div>
            {entries.map(([status, count]) => (
              <div
                key={status}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  color: "var(--color-text)",
                }}
              >
                <span>{status}</span>
                <span style={{ fontWeight: 600 }}>{count}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function formatMonthLabel(monthString) {
  const key = periodKeyForMonth(monthString);
  if (/^\d{4}-Q1$/.test(key)) return `Jan–Mar ${key.slice(0, 4)}`;
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthShort(monthString) {
  const key = periodKeyForMonth(monthString);
  if (/^\d{4}-Q1$/.test(key)) return "Jan–Mar";
  const [, month] = key.split("-").map(Number);
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
}

function monthsBetween(from, to) {
  const out = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

// Groups Jan/Feb/Mar rows into a single "YYYY-Q1" point: one assessment per
// child exists for that whole quarter, so the three calendar months are
// summed rather than plotted separately. Handles both shapes — a legacy
// 12-row monthly payload (groups client-side) and the current 10-row
// period payload that already carries a "YYYY-Q1" entry.
function periodSortValue(period) {
  const year = Number(period.slice(0, 4));
  if (period.endsWith("-Q1")) return year * 100 + 0;
  return year * 100 + Number(period.slice(5, 7));
}

function groupTrendByPeriod(rows, statuses) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const buckets = new Map();
  const order = [];
  for (const row of rows) {
    const period = periodKeyForMonth(row.month);
    if (!buckets.has(period)) {
      buckets.set(period, { month: period });
      for (const s of statuses) buckets.get(period)[s] = 0;
      order.push(period);
    }
    const bucket = buckets.get(period);
    for (const s of statuses) bucket[s] += row[s] || 0;
  }
  // Chronological order with Q1 first (it represents Jan–Mar).
  order.sort((a, b) => periodSortValue(a) - periodSortValue(b));
  return order.map((p) => buckets.get(p));
}

export default function HealthTrends() {
  const { barangays } = useBarangays();

  const [lineIndicator, setLineIndicator] = useState("wfa");
  const [visibleStatuses, setVisibleStatuses] = useState(
    () => new Set(STATUS_OPTIONS.wfa),
  );
  const [lineBarangay, setLineBarangay] = useState("");
  const [barMonth, setBarMonth] = useState(currentMonth());

  // Barangay comparison chart: 15 barangays per page, 3 pages max (45 barangays).
  const BAR_PAGE_SIZE = 15;
  const BAR_TOTAL_PAGES = 3;
  const [barPage, setBarPage] = useState(1);

  // Line chart always spans January–December of the current year.
  const trendYear = currentMonth().slice(0, 4);

  // Rev-gated: cached snapshots render instantly; the heavy endpoints
  // refetch only when revision counters moved server-side.
  const trendFrom = `${trendYear}-01`;
  const trendTo = `${trendYear}-12`;
  const trendParams = new URLSearchParams({ from: trendFrom, to: trendTo, indicator: lineIndicator });
  if (lineBarangay) trendParams.set("barangay", lineBarangay);
  const trendMonths = useMemo(() => monthsBetween(trendFrom, trendTo), [trendFrom, trendTo]);
  const trendQuery = useRevReport(`/reports/trends?${trendParams.toString()}`, trendMonths);
  // Stabilized so downstream memos don't recompute on every render when
  // there is no snapshot yet (data null → fresh [] each render otherwise).
  const trendStatuses = STATUS_OPTIONS[lineIndicator];
  const rawTrend = useMemo(() => trendQuery.data || [], [trendQuery.data]);
  // Jan–Mar renders as one "Jan–Mar" bracket: a single on-time assessment
  // covers that quarter, so the three calendar months are summed.
  const trend = useMemo(
    () => groupTrendByPeriod(rawTrend, trendStatuses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawTrend, lineIndicator]
  );
  const trendLoading = trendQuery.loading;
  const trendError = trendQuery.error;

  const barQuery = useRevReport(`/reports/barangay-comparison?month=${barMonth}`, [barMonth]);
  const barLoading = barQuery.loading;
  const barError = barQuery.error;

  // Reset to the first page whenever the month filter changes.
  useEffect(() => {
    setBarPage(1);
  }, [barMonth]);

  const allBarData = barQuery.data || [];
  const barTotal = allBarData.length;
  const barTotalPages = Math.min(BAR_TOTAL_PAGES, Math.ceil(barTotal / BAR_PAGE_SIZE) || 1);
  useEffect(() => {
    if (barPage > barTotalPages) setBarPage(barTotalPages);
  }, [barPage, barTotalPages]);

  const barData = allBarData.slice((barPage - 1) * BAR_PAGE_SIZE, barPage * BAR_PAGE_SIZE);
  const rangeStart = (barPage - 1) * BAR_PAGE_SIZE + 1;
  const rangeEnd = Math.min(barPage * BAR_PAGE_SIZE, barTotal);

  const barColor = "var(--status-severe-text)";

  const calloutTarget = periodKeyForMonth(currentMonth());
  const calloutLabel = calloutTarget.endsWith("-Q1") ? "Assessed Jan–Mar" : "Assessed this month";
  const currentMonthCount = useMemo(() => {
    const row =
      trend.find((r) => r.month === calloutTarget) || trend[trend.length - 1];
    return trendRowTotal(row, trendStatuses);
  }, [trend, trendStatuses, calloutTarget]);

  return (
    <div>
      <div className="page-header">
        <h1>Health Trends</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div
          style={{
            marginBottom: 4,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ marginBottom: 2 }}>
              {INDICATOR_OPTIONS.find((o) => o.value === lineIndicator).label}
            </h3>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: 13,
                margin: 0,
              }}
            >
              Case count per assessment period for January–December {trendYear}
              {lineBarangay ? ` in ${lineBarangay}` : " across all barangays"}. January–March
              is one on-time assessment, shown as a single Jan–Mar point.
            </p>
          </div>
          <div className="stat-callout">
            <div className="stat-callout-value">
              {trendLoading ? "…" : currentMonthCount}
            </div>
            <div className="stat-callout-label">{calloutLabel}</div>
          </div>
        </div>
        <div className="filter-bar">
          <div className="field">
            <label>Indicator</label>
            <Dropdown
              value={lineIndicator}
              options={INDICATOR_OPTIONS}
              onChange={(value) => {
                setLineIndicator(value);
                setVisibleStatuses(new Set(STATUS_OPTIONS[value]));
              }}
            />
          </div>
          <div className="field">
            <label>Barangay</label>
            <Dropdown
              value={lineBarangay}
              options={[
                { value: "", label: "All barangays" },
                ...barangays.map((b) => ({ value: b.name, label: b.name })),
              ]}
              onChange={setLineBarangay}
            />
          </div>
        </div>

        <div
          role="group"
          aria-label="Visible nutritional statuses"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            margin: "4px 0 12px",
          }}
        >
          {STATUS_OPTIONS[lineIndicator].map((status) => {
            const color = lineSeriesColor(status);
            const isVisible = visibleStatuses.has(status);
            return (
              <button
                key={status}
                type="button"
                role="checkbox"
                aria-checked={isVisible}
                onClick={() => {
                  setVisibleStatuses((current) => {
                    const next = new Set(current);
                    if (next.has(status)) next.delete(status);
                    else next.add(status);
                    return next;
                  });
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 9px",
                  border: `1px solid ${isVisible ? color : "var(--color-border)"}`,
                  borderRadius: 6,
                  background: "var(--color-surface)",
                  color: isVisible
                    ? "var(--color-text)"
                    : "var(--color-text-muted)",
                  opacity: isVisible ? 1 : 0.65,
                  cursor: "pointer",
                  font: "inherit",
                  fontSize: 12.5,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 13,
                    height: 13,
                    flex: "0 0 13px",
                    boxSizing: "border-box",
                    border: `2px solid ${color}`,
                    borderRadius: 3,
                    background: isVisible ? color : "transparent",
                  }}
                />
                {status}
              </button>
            );
          })}
        </div>

        <RefreshLine refreshing={trendQuery.refreshing} updatedAt={trendQuery.updatedAt} onRefresh={trendQuery.refresh} />

        {trendLoading ? (
          <div className="loading-state">Loading...</div>
        ) : trendError ? (
          <div className="empty-state">{trendError}</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={trend}
              margin={{ top: 8, right: 16, left: 12, bottom: 24 }}
            >
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthShort}
                stroke="var(--color-text-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
                interval={0}
                angle={-25}
                textAnchor="end"
                height={48}
              />
              <YAxis
                allowDecimals={false}
                stroke="var(--color-text-muted)"
                fontSize={12.5}
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={8}
              />
              <Tooltip
                labelFormatter={formatMonthLabel}
                formatter={(value, name) => [
                  `${value} child${value === 1 ? "" : "ren"}`,
                  name,
                ]}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text)",
                  boxShadow: "var(--shadow-md)",
                }}
              />
              {STATUS_OPTIONS[lineIndicator]
                .filter((status) => visibleStatuses.has(status))
                .map((status) => {
                  const color = lineSeriesColor(status);
                  return (
                    <Line
                      key={status}
                      type="monotone"
                      dataKey={status}
                      name={status}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={{
                        r: 3.5,
                        strokeWidth: 2,
                        stroke: "var(--color-surface)",
                        fill: color,
                      }}
                      activeDot={{
                        r: 5.5,
                        strokeWidth: 2,
                        stroke: "var(--color-surface)",
                        fill: color,
                      }}
                    />
                  );
                })}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3>Nutritional Issues by Barangay</h3>
        <p
          style={{
            color: "var(--color-text-muted)",
            fontSize: 13,
            marginTop: -8,
          }}
        >
          Children with a non-normal Weight-for-Age, Height-for-Age, or
          Weight-for-Length/Height status this month. A child flagged in more
          than one indicator is still only counted once — hover a bar for the
          breakdown.
        </p>
        <div className="filter-bar">
          <div className="field">
            <label>Month</label>
            <input
              className="input"
              type="month"
              value={barMonth}
              onChange={(e) => setBarMonth(e.target.value)}
            />
          </div>
        </div>

        <RefreshLine refreshing={barQuery.refreshing} updatedAt={barQuery.updatedAt} onRefresh={barQuery.refresh} />

        {barLoading ? (
          <div className="loading-state">Loading...</div>
        ) : barError ? (
          <div className="empty-state">{barError}</div>
        ) : barData.length === 0 ? (
          <div className="empty-state">No cases recorded for this filter.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={barData}
              margin={{ top: 8, right: 16, left: 12, bottom: 48 }}
            >
              <CartesianGrid
                stroke="var(--color-border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="barangay"
                stroke="var(--color-text-muted)"
                fontSize={12}
                angle={-40}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                stroke="var(--color-text-muted)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={8}
              />
              <Tooltip
                cursor={{ fill: "var(--color-row-hover)" }}
                content={<BarangayIssueTooltip />}
              />
              <Bar
                dataKey="count"
                name="Children with an issue"
                fill={barColor}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        {!barLoading && !barError && barTotal > 0 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {rangeStart}–{rangeEnd} of {barTotal} barangay{barTotal === 1 ? "" : "s"}
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={barPage <= 1}
                onClick={() => setBarPage(barPage - 1)}
              >
                Previous
              </button>
              <span className="pagination-page">
                Page {barPage} of {barTotalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={barPage >= barTotalPages}
                onClick={() => setBarPage(barPage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
