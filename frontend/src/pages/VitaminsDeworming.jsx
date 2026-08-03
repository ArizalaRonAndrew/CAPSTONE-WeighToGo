import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function VitaminsDeworming() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingKey, setMarkingKey] = useState(null);

  function load() {
    setLoading(true);
    api
      .get("/supplements/due")
      .then(setEntries)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markGiven(child, dose) {
    const key = `${child.id}-${dose.supplement_type}-${dose.dose_order}`;
    setMarkingKey(key);
    try {
      await api.post("/supplements", {
        child_id: child.id,
        supplement_type: dose.supplement_type,
        dose_order: dose.dose_order,
      });
      load();
    } finally {
      setMarkingKey(null);
    }
  }

  const totalDue = entries.reduce((sum, e) => sum + e.due.length, 0);

  return (
    <div>
      <div className="page-header">
        <h1>Vitamins & Deworming</h1>
      </div>

      <div className="stat-row">
        <div className="card stat-tile">
          <div className="value">{entries.length}</div>
          <div className="label">Children with pending doses</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{totalDue}</div>
          <div className="label">Total doses due</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Child</th>
              <th>Age</th>
              <th>Doses Due</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="loading-state">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-state">
                  No children are currently due for a dose.
                </td>
              </tr>
            )}
            {entries.map(({ child, ageInMonths, due }) => (
              <tr key={child.id}>
                <td>
                  <a href={`/children/${child.id}`} onClick={(e) => { e.preventDefault(); navigate(`/children/${child.id}`); }}>
                    {child.name}
                  </a>
                </td>
                <td>{ageInMonths} mo</td>
                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {due.map((dose) => {
                      const key = `${child.id}-${dose.supplement_type}-${dose.dose_order}`;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`badge ${dose.overdue ? "badge-severe" : "badge-mild"}`}
                          style={{ border: "none", cursor: "pointer" }}
                          disabled={markingKey === key}
                          onClick={() => markGiven(child, dose)}
                          title="Click to mark as given"
                        >
                          {dose.supplement_type} #{dose.dose_order}
                          {dose.overdue ? " (overdue)" : ""} — mark given
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
