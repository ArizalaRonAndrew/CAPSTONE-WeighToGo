import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";
import StatusBadge from "../components/StatusBadge";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const INDICATOR_LABELS = { wfa: "Weight-for-Age", hfa: "Height-for-Age", wfl_h: "Weight-for-Height" };

export default function Reports() {
  const { user } = useAuth();
  const { barangays } = useBarangays();
  const isAdmin = user?.role === "MNAO";

  const [month, setMonth] = useState(currentMonth());
  const [barangay, setBarangay] = useState("");
  const [nutrition, setNutrition] = useState(null);
  const [vitamins, setVitamins] = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    const params = new URLSearchParams({ month });
    if (isAdmin && barangay) params.set("barangay", barangay);
    const query = `?${params.toString()}`;

    Promise.all([api.get(`/reports/nutrition${query}`), api.get(`/reports/vitamins${query}`)])
      .then(([n, v]) => {
        setNutrition(n);
        setVitamins(v);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [month, barangay]);

  return (
    <div>
      <div className="page-header">
        <h1>{isAdmin ? "Consolidated Reports" : "Barangay Reports"}</h1>
      </div>

      <div className="filter-bar">
        <div className="field">
          <label>Month</label>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {isAdmin && (
          <div className="field">
            <label>Barangay</label>
            <select className="input" value={barangay} onChange={(e) => setBarangay(e.target.value)}>
              <option value="">All barangays</option>
              {barangays.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading && <div className="loading-state">Loading...</div>}

      {!loading && nutrition && (
        <>
          <h3 className="section-title">Monthly Nutrition Report — {nutrition.barangay}</h3>
          <div className="stat-row">
            <div className="card stat-tile">
              <div className="value">{nutrition.totalAssessments}</div>
              <div className="label">Assessments this month</div>
            </div>
          </div>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th>Status Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {["wfa", "hfa", "wfl_h"].map((key) => (
                  <tr key={key}>
                    <td>{INDICATOR_LABELS[key]}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.entries(nutrition[key]).length === 0 && "—"}
                        {Object.entries(nutrition[key]).map(([status, count]) => (
                          <span key={status} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <StatusBadge status={status} /> × {count}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && vitamins && (
        <>
          <h3 className="section-title">Vitamin Report — {vitamins.barangay}</h3>
          <div className="stat-row">
            <div className="card stat-tile">
              <div className="value">{vitamins.vitaminA}</div>
              <div className="label">Vitamin A doses given</div>
            </div>
            <div className="card stat-tile">
              <div className="value">{vitamins.deworming}</div>
              <div className="label">Deworming doses given</div>
            </div>
            <div className="card stat-tile">
              <div className="value">{vitamins.total}</div>
              <div className="label">Total doses given</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
