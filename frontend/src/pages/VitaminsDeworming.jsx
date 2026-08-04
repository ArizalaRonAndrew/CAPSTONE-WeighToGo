import { useEffect, useState } from "react";
import { api } from "../api/client";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];

function ordinal(n) {
  return ORDINALS[n - 1] || `${n}th`;
}

export default function VitaminsDeworming() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingKey, setMarkingKey] = useState(null);

  function load() {
    setLoading(true);
    api
      .get("/supplements/compliance")
      .then(setRows)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function markGiven(child_id, supplement_type, dose_order) {
    const key = `${child_id}-${supplement_type}`;
    setMarkingKey(key);
    try {
      await api.post("/supplements", { child_id, supplement_type, dose_order });
      load();
    } finally {
      setMarkingKey(null);
    }
  }

  function StatusCell({ childId, supplementType, entry, variant }) {
    if (entry.status === "not_eligible") {
      return <span className="badge badge-muted">Not eligible</span>;
    }
    if (entry.status === "complete") {
      return <span className="badge badge-normal">Up to date</span>;
    }
    const key = `${childId}-${supplementType}`;
    return (
      <button
        type="button"
        className={`dose-btn dose-btn-${variant}`}
        disabled={markingKey === key}
        onClick={() => markGiven(childId, supplementType, entry.dose_order)}
        title={entry.overdue ? "Overdue" : "Click to mark as given"}
      >
        Mark {ordinal(entry.dose_order)} Dose
      </button>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Vitamins &amp; Deworming Compliance</h1>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purok</th>
                <th>Name of Child</th>
                <th>Age (mos)</th>
                <th>Vitamin A Status</th>
                <th>Deworming Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="loading-state">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No children registered yet.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.child_id}>
                  <td>{row.purok}</td>
                  <td style={{ fontWeight: 700 }}>{row.name}</td>
                  <td>{row.age_in_months}</td>
                  <td>
                    <StatusCell
                      childId={row.child_id}
                      supplementType="Vitamin A"
                      entry={row.vitaminA}
                      variant="vitamin"
                    />
                  </td>
                  <td>
                    <StatusCell
                      childId={row.child_id}
                      supplementType="Deworming"
                      entry={row.deworming}
                      variant="deworming"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
