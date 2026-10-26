// Client-side mirror of backend/src/services/supplementSchedule.service.js
// (bracket display, 6-month sub-windows, strict rule — First must land in
// the exact bracket-opening month or its Second is "missed" — 6-month
// First→Second interval with a "waiting" state, 1-month grace, registration
// backfill of windows already open when the child joined). Kept in lockstep
// by construction — the constants below must change together with that file.
// Used offline from cached records; online the server is the source of truth.

export const GRACE_MONTHS = 1;
export const DOSE_INTERVAL_MONTHS = 6;
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const VITAMIN_A_BRACKETS = [
  { id: "6", label: "6 months", start_month: 6, end_month: 11, slots: ["Single Dose"] },
  { id: "12-23", label: "12-23 months", start_month: 12, end_month: 23, slots: ["First Dose", "Second Dose"] },
  { id: "24-35", label: "24-35 months", start_month: 24, end_month: 35, slots: ["First Dose", "Second Dose"] },
  { id: "36-47", label: "36-47 months", start_month: 36, end_month: 47, slots: ["First Dose", "Second Dose"] },
  { id: "48-59", label: "48-59 months", start_month: 48, end_month: 59, slots: ["First Dose", "Second Dose"] },
];

const DEWORMING_BRACKETS = [
  { id: "12-23", label: "12-23 months", start_month: 12, end_month: 23, slots: ["First Dose", "Second Dose"] },
  { id: "24-35", label: "24-35 months", start_month: 24, end_month: 35, slots: ["First Dose", "Second Dose"] },
  { id: "36-47", label: "36-47 months", start_month: 36, end_month: 47, slots: ["First Dose", "Second Dose"] },
  { id: "48-59", label: "48-59 months", start_month: 48, end_month: 59, slots: ["First Dose", "Second Dose"] },
];

export function getBrackets(supplementType) {
  if (supplementType === "Vitamin A") return VITAMIN_A_BRACKETS;
  if (supplementType === "Deworming") return DEWORMING_BRACKETS;
  throw new Error(`Unknown supplement type: ${supplementType}`);
}

export function formatRequirement(slot, bracketLabel) {
  return `${slot} for ${bracketLabel}`;
}

function subWindow(bracket, slot) {
  if (slot === "Second Dose") {
    return { start_month: bracket.start_month + 6, end_month: bracket.end_month };
  }
  if (bracket.slots.length > 1) {
    return { start_month: bracket.start_month, end_month: bracket.start_month + 5 };
  }
  return { start_month: bracket.start_month, end_month: bracket.end_month };
}

export function getScheduleWindows(supplementType) {
  const brackets = getBrackets(supplementType);
  const windows = [];
  let doseOrder = 1;
  for (const bracket of brackets) {
    for (const slot of bracket.slots) {
      const sub = subWindow(bracket, slot);
      windows.push({
        dose_order: doseOrder,
        start_month: sub.start_month,
        end_month: sub.end_month,
        bracket_id: bracket.id,
        bracket_label: bracket.label,
        slot,
        requirement: formatRequirement(slot, bracket.label),
      });
      doseOrder += 1;
    }
  }
  return windows;
}

// Registration-time perfect-history assumption — mirror of the backend
// helper. Every dose window whose opening month the child had already reached
// when they were registered is seeded as given exactly on schedule, so only
// windows that open after registration ever show a Give button. Used by the
// offline (tmp_…) child view; the server seeds the real rows on sync.
export function buildRegistrationBackfill(dob, ageAtRegistration) {
  const age = Number(ageAtRegistration);
  if (!dob || !Number.isFinite(age)) return [];

  const rows = [];
  for (const supplementType of ["Vitamin A", "Deworming"]) {
    for (const window of getScheduleWindows(supplementType)) {
      if (window.start_month > age) continue;
      const dateAdministered = addMonthsToDateStr(dob, window.start_month);
      if (!dateAdministered) continue;
      rows.push({
        supplement_type: supplementType,
        dose_order: window.dose_order,
        age_in_months: window.start_month,
        date_administered: dateAdministered,
      });
    }
  }
  return rows;
}

export function addMonthsToDateStr(dateStr, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return null;
  const day = Number(m[3]);
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  const y = target.getUTCFullYear();
  const mo = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function ageOnDate(dob, dateString) {
  // Minimal dob/date math without importing age.js (kept dependency-free).
  const [by, bm, bd] = String(dob).slice(0, 10).split("-").map(Number);
  const [ry, rm, rd] = String(dateString).slice(0, 10).split("-").map(Number);
  let months = (ry - by) * 12 + (rm - bm);
  if (rd < bd) months -= 1;
  return Math.max(months, 0);
}

function firstGivenAge(firstRecord, currentAge, childDob) {
  if (!firstRecord) return null;
  if (firstRecord.age_in_months !== undefined && firstRecord.age_in_months !== null) {
    const n = Number(firstRecord.age_in_months);
    if (Number.isFinite(n)) return n;
  }
  if (firstRecord.date_administered && childDob) {
    try {
      return ageOnDate(childDob, firstRecord.date_administered);
    } catch {
      return currentAge;
    }
  }
  return currentAge;
}

function resolveDoseStatus({ ageInMonths, window, bracket, firstRecord, childDob, todayStr }) {
  const isSecond = window.slot === "Second Dose";
  const firstGiven = Boolean(firstRecord);
  const locked = isSecond && !firstGiven;

  // Strict rule, no grace: the First Dose unlocks its Second ONLY when given
  // in the exact month the bracket opens. Any later month voids the Second
  // as permanently missed.
  if (isSecond && firstGiven) {
    const fAge = firstGivenAge(firstRecord, ageInMonths, childDob);
    if (fAge !== bracket.start_month) {
      return { status: "missed", actionable: false, locked: false, opensAtMonth: null, opensOnDate: null };
    }
  }

  if (isSecond && firstGiven) {
    const opensAtMonth = firstGivenAge(firstRecord, ageInMonths, childDob) + DOSE_INTERVAL_MONTHS;
    const opensOnDate = firstRecord.date_administered
      ? addMonthsToDateStr(firstRecord.date_administered, DOSE_INTERVAL_MONTHS)
      : null;
    // Exact-date gate: unlocks on the 6-month anniversary of the actual
    // First Dose date; falls back to month arithmetic without usable dates.
    if (opensOnDate && todayStr && /^\d{4}-\d{2}-\d{2}/.test(todayStr)) {
      if (String(todayStr).slice(0, 10) < opensOnDate) {
        return { status: "waiting", actionable: false, locked: false, opensAtMonth, opensOnDate };
      }
    } else if (ageInMonths < opensAtMonth) {
      return { status: "waiting", actionable: false, locked: false, opensAtMonth, opensOnDate };
    }
    if (ageInMonths <= window.end_month) {
      return { status: "due", actionable: true, locked: false, opensAtMonth, opensOnDate };
    }
    return { status: "overdue", actionable: true, locked: false, opensAtMonth, opensOnDate };
  }

  if (ageInMonths < window.start_month) {
    return { status: "upcoming", actionable: false, locked: false, opensAtMonth: null, opensOnDate: null };
  }
  if (ageInMonths <= window.end_month) {
    if (locked) return { status: "locked", actionable: false, locked: true, opensAtMonth: null, opensOnDate: null };
    return { status: "due", actionable: true, locked: false, opensAtMonth: null, opensOnDate: null };
  }
  if (ageInMonths <= window.end_month + GRACE_MONTHS) {
    if (locked) return { status: "locked", actionable: false, locked: true, opensAtMonth: null, opensOnDate: null };
    return { status: "overdue", actionable: true, locked: false, opensAtMonth: null, opensOnDate: null };
  }
  return { status: "closed", actionable: false, locked: false, opensAtMonth: null, opensOnDate: null };
}

function buildDoseEntries(ageInMonths, existingRecords, supplementType, childDob = null, todayStr = null) {
  const brackets = getBrackets(supplementType);
  const windows = getScheduleWindows(supplementType);
  const recordsByDose = new Map(
    existingRecords.filter((r) => r.supplement_type === supplementType).map((r) => [r.dose_order, r])
  );

  const firstByBracket = new Map();
  for (const bracket of brackets) {
    const bracketWindows = windows.filter((w) => w.bracket_id === bracket.id);
    const firstWindow = bracketWindows.find((w) => w.slot !== "Second Dose") || bracketWindows[0];
    firstByBracket.set(bracket.id, {
      bracket,
      firstRecord: firstWindow ? recordsByDose.get(firstWindow.dose_order) || null : null,
    });
  }

  return windows.map((window) => {
    const record = recordsByDose.get(window.dose_order) || null;
    const bracketFlags = firstByBracket.get(window.bracket_id) || {};
    const firstRecord = bracketFlags.firstRecord || null;
    const bracket = bracketFlags.bracket || brackets.find((b) => b.id === window.bracket_id);

    if (record) {
      return {
        supplement_type: supplementType,
        dose_order: window.dose_order,
        window_start_month: window.start_month,
        window_end_month: window.end_month,
        bracket_id: window.bracket_id,
        bracket_label: window.bracket_label,
        slot: window.slot,
        requirement: window.requirement,
        status: "given",
        actionable: false,
        locked: false,
        overdue: false,
        opens_at_month: null,
        opens_on_date: null,
        date_administered: record.date_administered || null,
        age_in_months: record.age_in_months ?? null,
        created_at: record.created_at || null,
        record_id: record.id || null,
        _queued: Boolean(record._queued),
      };
    }

    if (window.slot !== "Second Dose") {
      const secondWindow = windows.find((w) => w.bracket_id === window.bracket_id && w.slot === "Second Dose");
      const secondRecord = secondWindow ? recordsByDose.get(secondWindow.dose_order) : null;
      if (secondRecord && !bracketFlags.firstRecord) {
        return {
          supplement_type: supplementType,
          dose_order: window.dose_order,
          window_start_month: window.start_month,
          window_end_month: window.end_month,
          bracket_id: window.bracket_id,
          bracket_label: window.bracket_label,
          slot: window.slot,
          requirement: window.requirement,
          status: "closed",
          actionable: false,
          locked: false,
          overdue: false,
          skipped: true,
          opens_at_month: null,
          opens_on_date: null,
          date_administered: null,
          age_in_months: null,
          created_at: null,
          record_id: null,
          _queued: false,
        };
      }
    }

    const resolved = resolveDoseStatus({ ageInMonths, window, bracket, firstRecord, childDob, todayStr });

    return {
      supplement_type: supplementType,
      dose_order: window.dose_order,
      window_start_month: window.start_month,
      window_end_month: window.end_month,
      bracket_id: window.bracket_id,
      bracket_label: window.bracket_label,
      slot: window.slot,
      requirement: window.requirement,
      status: resolved.status,
      actionable: resolved.actionable,
      locked: resolved.locked,
      overdue: resolved.status === "overdue",
      opens_at_month: resolved.opensAtMonth,
      opens_on_date: resolved.opensOnDate || null,
      date_administered: null,
      age_in_months: null,
      created_at: null,
      record_id: null,
      _queued: false,
    };
  });
}

// Same merge rule as the server. Queued entries may carry `_queued: true`.
// `todayStr` (YYYY-MM-DD) drives the exact-date 6-month Second unlock.
export function getSupplementSchedule(ageInMonths, existingRecords = [], childDob = null, todayStr = null) {
  const schedule = {};
  for (const supplementType of ["Vitamin A", "Deworming"]) {
    schedule[supplementType] = buildDoseEntries(ageInMonths, existingRecords, supplementType, childDob, todayStr);
  }
  return schedule;
}

// Undo is only offered within 24h of the tap. Queued rows are always fresh.
export function isUndoableDose(dose, now = Date.now()) {
  if (!dose || dose.status !== "given") return false;
  if (dose._queued && !dose.record_id) return true;
  const ts = dose.created_at || null;
  if (ts) {
    const t = new Date(ts).getTime();
    if (Number.isFinite(t)) return now - t < UNDO_WINDOW_MS;
    return false;
  }
  return false;
}
