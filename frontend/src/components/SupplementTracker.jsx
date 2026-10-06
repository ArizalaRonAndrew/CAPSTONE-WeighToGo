import { useEffect, useState } from "react";
import { api } from "../api/client";
import { listEntries, isTmpId } from "../utils/outbox";
import { getSupplementSchedule } from "../utils/supplementSchedule";
import { ageInMonths } from "../utils/age";

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

function DoseChip({ dose, onMark, marking, readOnly }) {
  const actionable = !readOnly && (dose.status === "due" || dose.status === "overdue");
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

function SupplementBlock({ type, doses, onMark, markingKey, readOnly }) {
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
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

export default function SupplementTracker({ childId, childDob, onChanged, readOnly = false }) {
  const [schedule, setSchedule] = useState(null);
  // Server-computed or locally computed from saved records — shown so field
  // staff know whether dose states are authoritative or provisional.
  const [scheduleSource, setScheduleSource] = useState("server");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [markError, setMarkError] = useState("");
  const [markNotice, setMarkNotice] = useState("");
  const [markingKey, setMarkingKey] = useState(null);

  async function load() {
    setLoading(true);
    setLoadError("");
    // Placeholder ids don't exist server-side — a brand-new unsynced child
    // affirmatively has no server records, so build locally from queued
    // doses only instead of a request that can only fail.
    if (isTmpId(childId)) {
      try {
        if (!childDob) throw new Error("Birthdate missing for this registration.");
        const queued = await listEntries();
        const pending = queued
          .filter((e) => e.method === "POST" && e.path.split("?")[0] === "/supplements" && String(e.body?.child_id) === String(childId))
          .map((e) => ({ supplement_type: e.body.supplement_type, dose_order: e.body.dose_order, _queued: true }));
        setSchedule(getSupplementSchedule(ageInMonths(childDob), pending));
        setScheduleSource("local");
      } catch (err) {
        setLoadError(err.message || "Failed to load the supplement schedule");
      } finally {
        setLoading(false);
      }
      return;
    }
    const hadData = schedule !== null;
    try {
      const data = await api.get(`/supplements/schedule?childId=${childId}`);
      setSchedule(data.schedule);
      setScheduleSource("server");
      // Prime the raw-records cache in the background so the offline
      // fallback below has affirmative data to build from later.
      api.get(`/supplements?childId=${childId}`).catch(() => {});
    } catch (err) {
      if (!err.network) {
        setLoadError(err.message || "Failed to load the supplement schedule");
      } else {
        // Offline fallback: rebuild the identical schedule locally from the
        // child's saved records. Refuses to fabricate — without affirmative
        // record data (or the birthdate it keys off), it errors instead of
        // showing every dose as due and inviting double-recording.
        try {
          await loadOffline();
        } catch (offlineErr) {
          if (!hadData) setLoadError(offlineErr.message);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadOffline() {
    if (!childDob) {
      throw new Error("You're offline and this child's birthdate isn't saved here yet. Open this profile once online first.");
    }
    const records = await api.get(`/supplements?childId=${childId}`);
    if (!Array.isArray(records)) {
      throw new Error("You're offline and there's no saved supplement history for this child yet.");
    }
    // api.get throws (not returns null) when nothing is cached, so reaching
    // here means the server affirmed this record set — including empty.
    const queued = await listEntries();
    const pending = queued
      .filter((e) => e.method === "POST" && e.path.split("?")[0] === "/supplements" && String(e.body?.child_id) === String(childId))
      .map((e) => ({ supplement_type: e.body.supplement_type, dose_order: e.body.dose_order, _queued: true }));
    setSchedule(getSupplementSchedule(ageInMonths(childDob), [...records, ...pending]));
    setScheduleSource("local");
  }

  // load reads `schedule` only to decide whether an offline failure deserves
  // an error banner — it must not re-run when schedule changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [childId]);

  async function handleMark(dose) {
    const key = `${dose.supplement_type}-${dose.dose_order}`;
    setMarkingKey(key);
    setMarkError("");
    setMarkNotice("");
    try {
      const result = await api.post("/supplements", {
        child_id: childId,
        supplement_type: dose.supplement_type,
        dose_order: dose.dose_order,
      });
      if (result?._queued) {
        setMarkNotice("Dose saved on this device — will sync when you're back online.");
      }
      load();
      onChanged?.();
    } catch (err) {
      setMarkError(err.message || "Failed to record that dose. Please try again.");
    } finally {
      setMarkingKey(null);
    }
  }

  if (loading) return <div className="loading-state">Loading...</div>;
  if (loadError) {
    return (
      <div className="loading-state">
        <p className="error-text">{loadError}</p>
        <button className="btn" onClick={load}>
          Retry
        </button>
      </div>
    );
  }
  if (!schedule) return null;

  const queuedCount = Object.values(schedule)
    .flat()
    .filter((d) => d._queued).length;

  return (
    <div>
      {markError && <p className="error-text">{markError}</p>}
      {markNotice && <div className="banner banner-success">{markNotice}</div>}
      {scheduleSource === "local" && (
        <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Computed offline from this device&apos;s saved records.
          {queuedCount > 0 && ` Includes ${queuedCount} dose${queuedCount === 1 ? "" : "s"} waiting to sync.`}
        </p>
      )}
      <div className="supplement-grid">
        {Object.entries(schedule).map(([type, doses]) => (
          <SupplementBlock
            key={type}
            type={type}
            doses={doses}
            onMark={handleMark}
            markingKey={markingKey}
            readOnly={readOnly}
          />
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
