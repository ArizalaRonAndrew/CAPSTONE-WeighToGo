import { useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api/client";
import { useBarangays } from "../../hooks/useBarangays";
import { colorVarForStatus } from "../../utils/statusGroups";
import { currentMonth, addMonths } from "../../utils/month";

const INDICATOR_OPTIONS = [
  { value: "wfa", label: "Weight-for-Age" },
  { value: "hfa", label: "Height-for-Age" },
  { value: "wfl_h", label: "Weight-for-Height" },
];

const STATUS_OPTIONS = {
  wfa: ["Normal", "Underweight", "Severely Underweight"],
  hfa: ["Normal", "Stunted", "Severely Stunted"],
  wfl_h: ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"],
};

// colorVarForStatus buckets Overweight and Obese under the same "over"
// color since they share a severity group; give Obese its own hue so both
// are still distinguishable when both lines are on the chart at once.
function lineSeriesColor(status) {
  if (status === "Obese") return "#7c3aed";
  return colorVarForStatus(status);
}

function formatMonthLabel(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function HealthTrends() {
  const { barangays } = useBarangays();

  const [lineIndicator, setLineIndicator] = useState("wfa");
  const [lineStatus, setLineStatus] = useState("");
  const [lineBarangay, setLineBarangay] = useState("");
  const [trend, setTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");

  const [barMonth, setBarMonth] = useState(currentMonth());
  const [barIndicator, setBarIndicator] = useState("wfa");
  const [barStatus, setBarStatus] = useState("Underweight");
  const [barData, setBarData] = useState([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barError, setBarError] = useState("");

  useEffect(() => {
    setTrendLoading(true);
    setTrendError("");
    const from = addMonths(currentMonth(), -5);
    const to = currentMonth();
    const params = new URLSearchParams({ from, to, indicator: lineIndicator, status: lineStatus });
    if (lineBarangay) params.set("barangay", lineBarangay);
    api
      .get(`/reports/trends?${params.toString()}`)
      .then(setTrend)
      .catch((err) => setTrendError(err.message || "Failed to load trend data"))
      .finally(() => setTrendLoading(false));
  }, [lineIndicator, lineStatus, lineBarangay]);

  useEffect(() => {
    setBarLoading(true);
    setBarError("");
    const params = new URLSearchParams({ month: barMonth, indicator: barIndicator, status: barStatus });
    api
      .get(`/reports/barangay-comparison?${params.toString()}`)
      .then((data) => setBarData(data.slice(0, 15)))
      .catch((err) => setBarError(err.message || "Failed to load barangay comparison data"))
      .finally(() => setBarLoading(false));
  }, [barMonth, barIndicator, barStatus]);

  const lineColor = colorVarForStatus(lineStatus);
  const barColor = colorVarForStatus(barStatus);

  return (
    <div>
      <div className="page-header">
        <h1>Health Trends</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 4 }}>
          <h3 style={{ marginBottom: 2 }}>
            {lineStatus || "All Statuses"} — {INDICATOR_OPTIONS.find((o) => o.value === lineIndicator).label}
          </h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>
            Monthly case count over the last 6 months{lineBarangay ? ` in ${lineBarangay}` : " across all barangays"}.
          </p>
        </div>
        <div className="filter-bar">
          <div className="field">
            <label>Indicator</label>
            <select
              className="input"
              value={lineIndicator}
              onChange={(e) => {
                setLineIndicator(e.target.value);
                setLineStatus("");
              }}
            >
              {INDICATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" value={lineStatus} onChange={(e) => setLineStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS[lineIndicator].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Barangay</label>
            <select className="input" value={lineBarangay} onChange={(e) => setLineBarangay(e.target.value)}>
              <option value="">All barangays</option>
              {barangays.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {trendLoading ? (
          <div className="loading-state">Loading...</div>
        ) : trendError ? (
          <div className="empty-state">{trendError}</div>
        ) : (
          <ResponsiveContainer width="100%" height={lineStatus ? 300 : 320}>
            <ComposedChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              {lineStatus && (
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatMonthLabel}
                stroke="var(--color-text-muted)"
                fontSize={12.5}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                allowDecimals={false}
                stroke="var(--color-text-muted)"
                fontSize={12.5}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip
                labelFormatter={formatMonthLabel}
                formatter={(value, name) => [`${value} child${value === 1 ? "" : "ren"}`, name]}
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  color: "var(--color-text)",
                  boxShadow: "var(--shadow-md)",
                }}
              />
              {lineStatus ? (
                <>
                  <Area type="monotone" dataKey="count" stroke="none" fill="url(#trendFill)" isAnimationActive={false} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name={lineStatus}
                    stroke={lineColor}
                    strokeWidth={2.5}
                    dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)", fill: lineColor }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--color-surface)", fill: lineColor }}
                  />
                </>
              ) : (
                <>
                  <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: 12.5 }} />
                  {STATUS_OPTIONS[lineIndicator].map((s) => {
                    const color = lineSeriesColor(s);
                    return (
                      <Line
                        key={s}
                        type="monotone"
                        dataKey={s}
                        name={s}
                        stroke={color}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, strokeWidth: 2, stroke: "var(--color-surface)", fill: color }}
                        activeDot={{ r: 5.5, strokeWidth: 2, stroke: "var(--color-surface)", fill: color }}
                      />
                    );
                  })}
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h3>
          {barStatus} — {INDICATOR_OPTIONS.find((o) => o.value === barIndicator).label} by Barangay
        </h3>
        <div className="filter-bar">
          <div className="field">
            <label>Month</label>
            <input className="input" type="month" value={barMonth} onChange={(e) => setBarMonth(e.target.value)} />
          </div>
          <div className="field">
            <label>Indicator</label>
            <select
              className="input"
              value={barIndicator}
              onChange={(e) => {
                setBarIndicator(e.target.value);
                setBarStatus(STATUS_OPTIONS[e.target.value][0]);
              }}
            >
              {INDICATOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select className="input" value={barStatus} onChange={(e) => setBarStatus(e.target.value)}>
              {STATUS_OPTIONS[barIndicator].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {barLoading ? (
          <div className="loading-state">Loading...</div>
        ) : barError ? (
          <div className="empty-state">{barError}</div>
        ) : barData.length === 0 ? (
          <div className="empty-state">No cases recorded for this filter.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={barData} margin={{ top: 8, right: 16, left: 0, bottom: 48 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="barangay"
                stroke="var(--color-text-muted)"
                fontSize={12}
                angle={-40}
                textAnchor="end"
                interval={0}
              />
              <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-text)",
                }}
              />
              <Bar dataKey="count" name={barStatus} fill={barColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
