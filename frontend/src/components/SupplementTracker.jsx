import { useEffect, useState } from "react";
import { api } from "../api/client";

const STATUS_LABEL = {
  given: "Given",
  due: "Due now",
  overdue: "Overdue",
  upcoming: "Not yet due",
};

function formatWindow(dose) {
  const end = dose.window_end_month >= 59 ? "59+" : dose.window_end_month;
  return `${dose.window_start_month}-${end} mo`;
}

function DoseChip({ dose, onMark, marking }) {
  const actionable = dose.status === "due" || dose.status === "overdue";
  return (
    <div className="dose-chip" title={`Dose ${dose.dose_order} · ${formatWindow(dose)} · ${STATUS_LABEL[dose.status]}`}>
      <div className={`dose-circle dose-${dose.status}`}>
        {dose.status === "given" ? "✓" : dose.status === "overdue" ? "!" : dose.dose_order}
      </div>
      <div className="dose-window">{formatWindow(dose)}</div>
      {dose.status === "given" && <div className="dose-date">{dose.date_administered}</div>}
      {actionable && (
        <button
          type="button"
          className={`btn btn-sm ${dose.status === "overdue" ? "btn-danger" : "btn-accent"}`}
          disabled={marking}
          onClick={() => onMark(dose)}
        >
          {marking ? "Saving..." : "Mark given"}
        </button>
      )}
    </div>
  );
}

function SupplementBlock({ type, doses, onMark, markingKey }) {
  const given = doses.filter((d) => d.status === "given").length;
  const overdue = doses.filter((d) => d.status === "overdue").length;
  const pct = doses.length ? Math.round((given / doses.length) * 100) : 0;

  return (
    <div className="supplement-block">
      <div className="supplement-block-header">
        <div className="supplement-block-title">{type}</div>
        <div className="supplement-block-count">
          {given}/{doses.length} doses
        </div>
      </div>

      <div className="supplement-progress-track">
        <div className="supplement-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {overdue > 0 && <div className="supplement-overdue-note">{overdue} dose{overdue > 1 ? "s" : ""} overdue</div>}

      <div className="dose-grid">
        {doses.map((dose) => (
          <DoseChip
            key={dose.dose_order}
            dose={dose}
            onMark={onMark}
            marking={markingKey === `${type}-${dose.dose_order}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function SupplementTracker({ childId }) {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [markingKey, setMarkingKey] = useState(null);

  function load() {
    setLoading(true);
    api
      .get(`/supplements/schedule?childId=${childId}`)
      .then((data) => setSchedule(data.schedule))
      .finally(() => setLoading(false));
  }

  useEffect(load, [childId]);

  async function handleMark(dose) {
    const key = `${dose.supplement_type}-${dose.dose_order}`;
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

  if (loading) return <div className="loading-state">Loading...</div>;
  if (!schedule) return null;

  return (
    <div>
      <div className="supplement-grid">
        {Object.entries(schedule).map(([type, doses]) => (
          <SupplementBlock key={type} type={type} doses={doses} onMark={handleMark} markingKey={markingKey} />
        ))}
      </div>
      <div className="supplement-legend">
        <span><span className="legend-dot legend-dot-given" />Given</span>
        <span><span className="legend-dot legend-dot-due" />Due now</span>
        <span><span className="legend-dot legend-dot-overdue" />Overdue</span>
        <span><span className="legend-dot legend-dot-upcoming" />Not yet due</span>
      </div>
    </div>
  );
}
