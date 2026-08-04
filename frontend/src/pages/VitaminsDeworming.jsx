import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

function ordinal(n) {
  return ORDINALS[n - 1] || `${n}th`;
}

function DosePill({ childId, dose, onMark, marking }) {
  const key = `${childId}-${dose.supplement_type}-${dose.dose_order}`;
  const variant = dose.supplement_type === "Vitamin A" ? "vitamin" : "deworming";
  return (
    <button
      type="button"
      className={`dose-btn dose-btn-${variant}`}
      disabled={marking === key}
      onClick={() => onMark(childId, dose)}
      title="Click to mark as given"
    >
      Mark {dose.supplement_type} — {ordinal(dose.dose_order)} Dose
    </button>
  );
}

export default function VitaminsDeworming() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingKey, setMarkingKey] = useState(null);

  function load() {
    setLoading(true);
    api
      .get("/supplements/due")
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => (a.child.purok || "").localeCompare(b.child.purok || "") || a.child.name.localeCompare(b.child.name)
        );
        setEntries(sorted);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markGiven(childId, dose) {
    const key = `${childId}-${dose.supplement_type}-${dose.dose_order}`;
    setMarkingKey(key);
    try {
      await api.post("/supplements", {
        child_id: childId,
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
        <div>
          <h1>Vitamins &amp; Deworming</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Children whose age means they need a Vitamin A or Deworming dose now.
          </p>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat-tile">
          <div className="value">{loading ? "…" : entries.length}</div>
          <div className="label">Children needing a dose</div>
        </div>
        <div className="card stat-tile">
          <div className="value">{loading ? "…" : totalDue}</div>
          <div className="label">Total doses due</div>
        </div>
      </div>

      {!loading && entries.length === 0 && (
        <div className="banner banner-success" style={{ marginBottom: 20 }}>
          No children currently need a dose.
        </div>
      )}

      {(loading || entries.length > 0) && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Purok</th>
                  <th>Name of Child</th>
                  <th>Age</th>
                  <th>Doses Due</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="loading-state">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading &&
                  entries.map(({ child, ageInMonths, due }) => (
                    <tr key={child.id}>
                      <td>{child.purok}</td>
                      <td style={{ fontWeight: 700 }}>
                        <a
                          href={`/children/${child.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/children/${child.id}`);
                          }}
                        >
                          {child.name}
                        </a>
                      </td>
                      <td>{ageInMonths} mo</td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {due.map((dose) => (
                            <DosePill
                              key={`${dose.supplement_type}-${dose.dose_order}`}
                              childId={child.id}
                              dose={dose}
                              onMark={markGiven}
                              marking={markingKey}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
