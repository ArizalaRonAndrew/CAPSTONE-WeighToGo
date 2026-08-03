import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
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

export default function HealthTrends() {
  const { barangays } = useBarangays();

  const [lineIndicator, setLineIndicator] = useState("wfa");
  const [lineStatus, setLineStatus] = useState("Underweight");
  const [lineBarangay, setLineBarangay] = useState("");
  const [trend, setTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);

  const [barMonth, setBarMonth] = useState(currentMonth());
  const [barIndicator, setBarIndicator] = useState("wfa");
  const [barStatus, setBarStatus] = useState("Underweight");
  const [barData, setBarData] = useState([]);
  const [barLoading, setBarLoading] = useState(true);

  useEffect(() => {
    setTrendLoading(true);
    const from = addMonths(currentMonth(), -5);
    const to = currentMonth();
    const params = new URLSearchParams({ from, to, indicator: lineIndicator, status: lineStatus });
    if (lineBarangay) params.set("barangay", lineBarangay);
    api
      .get(`/reports/trends?${params.toString()}`)
      .then(setTrend)
      .finally(() => setTrendLoading(false));
  }, [lineIndicator, lineStatus, lineBarangay]);

  useEffect(() => {
    setBarLoading(true);
    const params = new URLSearchParams({ month: barMonth, indicator: barIndicator, status: barStatus });
    api
      .get(`/reports/barangay-comparison?${params.toString()}`)
      .then((data) => setBarData(data.slice(0, 15)))
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
        <h3>{lineStatus} — {INDICATOR_OPTIONS.find((o) => o.value === lineIndicator).label} (last 6 months)</h3>
        <div className="filter-bar">
          <div className="field">
            <label>Indicator</label>
            <select
              className="input"
              value={lineIndicator}
              onChange={(e) => {
                setLineIndicator(e.target.value);
                setLineStatus(STATUS_OPTIONS[e.target.value][0]);
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
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" stroke="var(--color-text-muted)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--color-text-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  color: "var(--color-text)",
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name={lineStatus}
                stroke={lineColor}
                strokeWidth={2}
                dot={{ r: 4, fill: lineColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--color-text-muted)" }}>
            View as table
          </summary>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
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
