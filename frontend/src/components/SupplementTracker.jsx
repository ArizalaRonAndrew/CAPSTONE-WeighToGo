import { useEffect, useState } from "react";
import { api } from "../api/client";
import { listEntries, isTmpId } from "../utils/outbox";
import { buildRegistrationBackfill, getSupplementSchedule } from "../utils/supplementSchedule";
import { ageInMonths, ageInMonthsOn } from "../utils/age";
import { todayInManila } from "../utils/month";

function shortBracket(bracketId) {
  if (bracketId === "6") return "6 mo";
  return `${String(bracketId).replace("-", "–")}m`;
}

function shortDate(dateString) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateString || ""));
  if (!m) return String(dateString || "");
  return `${Number(m[2])}/${Number(m[3])}/${m[1].slice(2)}`;
}

// Human-readable unlock moment for a waiting Second Dose: exact calendar
// date when known ("7/15/25"), otherwise the month-age fallback ("18m").
function opensLabel(dose) {
  if (dose.opens_on_date) return shortDate(dose.opens_on_date);
  if (dose.opens_at_month) return `${dose.opens_at_month}m`;
  return "";
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="11" height="11" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// One compact dose cell: pill button or status text. A recorded dose always
// renders its administration date — never a Give button again.
function DoseCell({ dose, onMark, marking, readOnly }) {
  if (dose.status === "given") {
    return (
      <span className="dose-pill dose-is-given" title={`${dose.requirement} · Given ${dose.date_administered || ""}`}>
        <span className="dose-tick">✓</span>
        <span className="dose-val">{dose.date_administered ? shortDate(dose.date_administered) : "Given"}</span>
        {(dose._queued || marking) && <span className="dose-sync" title={dose._queued ? "Waiting to sync" : "Confirming…"}>•</span>}
      </span>
    );
  }

  if (dose.status === "due" || dose.status === "overdue") {
    if (readOnly) {
      return (
        <span className={`dose-pill ${dose.status === "overdue" ? "dose-is-overdue" : "dose-is-due"}`} title={dose.requirement}>
          {dose.status === "overdue" ? "Overdue" : "Due"}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={`dose-pill dose-give ${dose.status === "overdue" ? "dose-is-overdue" : "dose-is-due"}`}
        disabled={marking}
        onClick={() => onMark(dose)}
        title={`${dose.requirement}${dose.status === "overdue" ? " · Overdue" : ""}`}
        aria-label={`Mark ${dose.requirement} given`}
      >
        {marking ? "…" : dose.status === "overdue" ? "Give • late" : "Give"}
      </button>
    );
  }

  if (dose.status === "waiting") {
    const label = opensLabel(dose);
    return (
      <span
        className="dose-pill dose-is-waiting"
        title={`${dose.requirement} · Unlocks ${dose.opens_on_date || `at ${dose.opens_at_month} months`} (6 months after the First Dose date)`}
      >
        Opens {label}
      </span>
    );
  }

  if (dose.status === "locked") {
    return (
      <span className="dose-pill dose-is-locked" title={`${dose.requirement} · Give the First Dose first`}>
        <LockIcon /> 1st
      </span>
    );
  }

  if (dose.status === "upcoming") {
    return (
      <span className="dose-pill dose-is-upcoming" title={`${dose.requirement} · Opens at ${dose.window_start_month} months`}>
        {dose.window_start_month}m
      </span>
    );
  }

  // A First Dose whose Second was recorded earlier under previous rules
  // (before the First→Second lock) is history that can no longer be acted
  // on — label it plainly instead of a bare dash.
  if (dose.status === "closed" && dose.skipped) {
    return (
      <span
        className="dose-pill dose-is-skipped"
        title={`${dose.requirement} · Skipped: the Second Dose was recorded earlier under previous rules, so this First Dose can no longer be given.`}
      >
        Skipped
      </span>
    );
  }

  // Late First voids Second: permanently ineligible — wait for the next
  // bracket's First Dose instead.
  if (dose.status === "missed") {
    return (
      <span
        className="dose-pill dose-is-missed"
        title={`${dose.requirement} · Missed: the First Dose was given late, so this Second Dose is no longer eligible. Wait for the next age bracket.`}
      >
        Missed
      </span>
    );
  }

  // closed
  return (
    <span className="dose-pill dose-is-closed" title={`${dose.requirement} · Closed`}>
      –
    </span>
  );
}

function groupByBracket(doses) {
  const groups = [];
  const byId = new Map();
  for (const dose of doses) {
    const key = dose.bracket_id || `${dose.window_start_month}-${dose.window_end_month}`;
    if (!byId.has(key)) {
      const group = {
        key,
        bracket_id: dose.bracket_id || key,
        bracket_label: dose.bracket_label || key,
        doses: [],
      };
      byId.set(key, group);
      groups.push(group);
    }
    byId.get(key).doses.push(dose);
  }
  return groups;
}

function doseInSlot(group, slot) {
  return group.doses.find((d) => d.slot === slot) || null;
}

function NextLine({ doses }) {
  const actionable = doses.filter((d) => d.status === "due" || d.status === "overdue")
    .sort((a, b) => (b.status === "overdue" ? 1 : 0) - (a.status === "overdue" ? 1 : 0));
  if (actionable.length > 0) {
    const d = actionable[0];
    const extra = actionable.length > 1 ? ` +${actionable.length - 1}` : "";
    return (
      <div className="supp-next supp-next-due">
        Next: <strong>{d.slot}</strong> · {shortBracket(d.bracket_id)}{d.status === "overdue" ? " · overdue" : ""}{extra}
      </div>
    );
  }
  const waiting = doses.filter((d) => d.status === "waiting")
    .sort((a, b) => String(a.opens_on_date || a.opens_at_month || 0).localeCompare(String(b.opens_on_date || b.opens_at_month || 0)))[0];
  if (waiting) {
    return (
      <div className="supp-next supp-next-wait">
        Next: <strong>{waiting.slot}</strong> · opens {opensLabel(waiting)} (6 mo after 1st)
      </div>
    );
  }
  const locked = doses.find((d) => d.status === "locked");
  if (locked) {
    return <div className="supp-next supp-next-idle">Next: give the First Dose to unlock Second</div>;
  }
  if (doses.some((d) => d.status === "given") && doses.every((d) => d.status === "given" || d.status === "closed" || d.status === "upcoming")) {
    return <div className="supp-next supp-next-done">All caught up</div>;
  }
  return <div className="supp-next supp-next-idle">No doses due</div>;
}

// One bracket row: fixed First slot + divider + fixed Second slot, so both
// buttons hold uniform positions across every row.
function BracketRow({ group, type, onMark, markingKey, readOnly }) {
  const cellProps = (dose) => ({
    dose,
    onMark,
    marking: markingKey === `${type}-${dose.dose_order}`,
    readOnly,
  });

  if (group.doses.length < 2) {
    const only = group.doses[0];
    return (
      <div className="supp-row">
        <span className="supp-bracket" title={group.bracket_label}>
          {shortBracket(group.bracket_id)}
        </span>
        <span className="supp-cell supp-cell-single">
          <span className="supp-slot-tag">Single dose</span>
          <DoseCell {...cellProps(only)} />
        </span>
      </div>
    );
  }

  const first = doseInSlot(group, "First Dose") || group.doses[0];
  const second = doseInSlot(group, "Second Dose") || group.doses[1];
  return (
    <div className="supp-row">
      <span className="supp-bracket" title={group.bracket_label}>
        {shortBracket(group.bracket_id)}
      </span>
      <span className="supp-cell">
        <span className="supp-slot-tag">1st</span>
        <DoseCell {...cellProps(first)} />
      </span>
      <span className="supp-sep" aria-hidden="true" />
      <span className="supp-cell">
        <span className="supp-slot-tag">2nd</span>
        <DoseCell {...cellProps(second)} />
      </span>
    </div>
  );
}

function SupplementBlock({ type, doses, onMark, markingKey, readOnly }) {
  const given = doses.filter((d) => d.status === "given").length;
  const groups = groupByBracket(doses);
  const pct = doses.length ? Math.round((given / doses.length) * 100) : 0;

  // Collapse fully-inactive brackets to save space; active rows stay visible.
  const isActiveGroup = (g) => g.doses.some((d) => ["given", "due", "overdue", "waiting", "locked"].includes(d.status));
  const active = groups.filter(isActiveGroup);
  const pastClosed = groups.filter((g) => !isActiveGroup(g) && g.doses.every((d) => d.status === "closed"));
  const future = groups.filter((g) => !isActiveGroup(g) && g.doses.every((d) => d.status === "upcoming"));
  const shown = active.length > 0 ? active : groups.slice(0, 1);
  const rowProps = { type, onMark, markingKey, readOnly };

  return (
    <div className="supplement-block supp-compact">
      <div className="supp-head">
        <span className="supp-title">{type}</span>
        <span className="supp-count">{given}/{doses.length}</span>
      </div>
      <div className="supp-bar"><div className="supp-fill" style={{ width: `${pct}%` }} /></div>
      <NextLine doses={doses} />

      <div className="supp-colhead" aria-hidden="true">
        <span className="supp-bracket" />
        <span className="supp-cell supp-colhead-cell">First Dose</span>
        <span className="supp-sep" />
        <span className="supp-cell supp-colhead-cell">Second Dose</span>
      </div>
      <div className="supp-rows">
        {shown.map((group) => (
          <BracketRow key={group.key} group={group} {...rowProps} />
        ))}
      </div>

      {(pastClosed.length > 0 || future.length > 0) && (
        <div className="supp-collapsed">
          {pastClosed.length > 0 && (
            <details className="supp-details">
              <summary>Earlier closed ({pastClosed.length})</summary>
              <div className="supp-rows supp-rows-dim">
                {pastClosed.map((group) => (
                  <BracketRow key={group.key} group={group} {...rowProps} markingKey={null} readOnly />
                ))}
              </div>
            </details>
          )}
          {future.length > 0 && (
            <details className="supp-details">
              <summary>Upcoming ({future.length})</summary>
              <div className="supp-rows supp-rows-dim">
                {future.map((group) => (
                  <BracketRow key={group.key} group={group} {...rowProps} markingKey={null} readOnly />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

export default function SupplementTracker({ childId, childDob, childCreatedAt = null, onChanged, readOnly = false }) {
  const [schedule, setSchedule] = useState(null);
  const [scheduleSource, setScheduleSource] = useState("server");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [markError, setMarkError] = useState("");
  const [markNotice, setMarkNotice] = useState("");
  const [markingKey, setMarkingKey] = useState(null);

  function dosesFromQueued(queued, childKey) {
    return queued
      .filter((e) => e.method === "POST" && e.path.split("?")[0] === "/supplements" && String(e.body?.child_id) === String(childKey))
      .map((e) => ({ supplement_type: e.body.supplement_type, dose_order: e.body.dose_order, _queued: true, _opId: e.opId }));
  }

  function queuedDeleteIds(queued) {
    const ids = new Set();
    for (const e of queued) {
      if (e.method !== "DELETE") continue;
      const clean = String(e.path || "").split("?")[0];
      const m = clean.match(/^\/supplements\/(.+)$/);
      if (m) ids.add(String(decodeURIComponent(m[1])));
    }
    return ids;
  }

  // Rebuild pseudo-records from the current schedule so optimistic taps can
  // recompute the full state machine locally (locks, 6-mo waits, grace).
  function recordsFromSchedule(sched, age, nowIso) {
    return Object.values(sched || {})
      .flat()
      .filter((d) => d.status === "given")
      .map((d) => ({
        supplement_type: d.supplement_type,
        dose_order: d.dose_order,
        date_administered: d.date_administered || todayInManila(),
        age_in_months: d.age_in_months ?? age,
        created_at: d.created_at || nowIso,
        id: d.record_id || `optimistic-${d.supplement_type}-${d.dose_order}`,
        _queued: Boolean(d._queued),
        _optimistic: Boolean(d._optimistic),
      }));
  }

  function optimisticScheduleAfterMark(prevSched, dose) {
    const age = ageInMonths(childDob);
    const today = todayInManila();
    const nowIso = new Date().toISOString();
    const base = recordsFromSchedule(prevSched, age, nowIso).filter(
      (r) => !(r.supplement_type === dose.supplement_type && r.dose_order === dose.dose_order)
    );
    base.push({
      supplement_type: dose.supplement_type,
      dose_order: dose.dose_order,
      date_administered: today,
      age_in_months: age,
      created_at: nowIso,
      id: dose.record_id || `optimistic-${dose.supplement_type}-${dose.dose_order}`,
      _optimistic: true,
    });
    return getSupplementSchedule(age, base, childDob, today);
  }

  async function load(opts = {}) {
    const silent = Boolean(opts.silent);
    if (!silent) setLoading(true);
    setLoadError("");
    if (isTmpId(childId)) {
      try {
        if (!childDob) throw new Error("Birthdate missing for this registration.");
        const queued = await listEntries();
        const pending = dosesFromQueued(queued, childId);
        // Unsynced registration: apply the same perfect-history backfill the
        // server will write on sync, using the registration instant (not the
        // current age) as the cutoff so an old queued registration doesn't
        // accumulate free doses while offline.
        const backfill = buildRegistrationBackfill(childDob, ageInMonthsOn(childDob, childCreatedAt || new Date()));
        setSchedule(
          getSupplementSchedule(ageInMonths(childDob), [...backfill, ...pending], childDob, todayInManila())
        );
        setScheduleSource("local");
      } catch (err) {
        setLoadError(err.message || "Failed to load the supplement schedule");
      } finally {
        if (!silent) setLoading(false);
      }
      return;
    }
    const hadData = schedule !== null;
    try {
      const data = await api.get(`/supplements/schedule?childId=${childId}`);
      setSchedule(data.schedule);
      setScheduleSource("server");
      api.get(`/supplements?childId=${childId}`).catch(() => {});
    } catch (err) {
      if (!err.network) {
        // Silent reconciles must never blank the optimistically-updated UI
        // into a full error screen — surface inline instead and rethrow so
        // the tap handler can roll back.
        if (silent) throw err;
        setLoadError(err.message || "Failed to load the supplement schedule");
      } else {
        try {
          await loadOffline();
        } catch (offlineErr) {
          if (silent) throw offlineErr;
          if (!hadData) setLoadError(offlineErr.message);
        }
      }
    } finally {
      if (!silent) setLoading(false);
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
    const queued = await listEntries();
    const pending = dosesFromQueued(queued, childId);
    const deletedIds = queuedDeleteIds(queued);
    const visible = records.filter((r) => !deletedIds.has(String(r.id)));
    setSchedule(getSupplementSchedule(ageInMonths(childDob), [...visible, ...pending], childDob, todayInManila()));
    setScheduleSource("local");
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [childId, childDob, childCreatedAt]);

  // Quietly confirm the server reflects a just-written dose. If the first
  // refresh still shows it as actionable (stale cache/replica), retry twice
  // while the optimistic date stays painted — the button never flips back
  // to Give on a confirmed write.
  async function confirmWrite(dose) {
    if (isTmpId(childId)) {
      await load({ silent: true });
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
      try {
        // `_r` busts the server response cache (it hashes all query params
        // into the cache key) so the confirm read can't bless stale data.
        const data = await api.get(`/supplements/schedule?childId=${childId}&_r=${Date.now()}`);
        const doses = data.schedule?.[dose.supplement_type] || [];
        const found = doses.find((d) => d.dose_order === dose.dose_order);
        setSchedule(data.schedule);
        setScheduleSource("server");
        api.get(`/supplements?childId=${childId}`).catch(() => {});
        if (!found || found.status === "given") return;
        // Server answered but hasn't reflected the write yet — retry.
      } catch (err) {
        if (!err.network) return;
        try {
          await loadOffline();
          return;
        } catch {
          return;
        }
      }
    }
    // Still stale after retries: keep the (correct) optimistic date painted;
    // the next open revalidates from the server.
  }

  async function handleMark(dose) {
    const key = `${dose.supplement_type}-${dose.dose_order}`;
    const prev = schedule;
    // Optimistic: paint the date instantly, then confirm with the server.
    setSchedule(optimisticScheduleAfterMark(prev, dose));
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
        setMarkNotice("Saved on this device — will sync when back online.");
      }
    } catch (err) {
      // The tap itself failed — roll the button back and explain inline.
      setSchedule(prev);
      setMarkError(err.message || "Failed to record that dose. Please try again.");
      setMarkingKey(null);
      return;
    }
    await confirmWrite(dose);
    setMarkingKey(null);
    // Tell the hosting page exactly what was recorded so it can drop that
    // dose from its own list instantly (no waiting on a slow refetch).
    onChanged?.({
      action: "marked",
      child_id: childId,
      supplement_type: dose.supplement_type,
      dose_order: dose.dose_order,
    });
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
    <div className="supp-wrap">
      {markError && <p className="error-text">{markError}</p>}
      {markNotice && <div className="banner banner-success">{markNotice}</div>}
      {scheduleSource === "local" && (
        <p className="supp-offline">
          Offline view{queuedCount > 0 && ` · ${queuedCount} waiting to sync`}.
        </p>
      )}
      <div className="supplement-grid supp-grid-compact">
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
      <div className="supp-legend">✓ given with date · <strong>Give</strong> due · Opens date waits 6 mo after 1st dose</div>
    </div>
  );
}
