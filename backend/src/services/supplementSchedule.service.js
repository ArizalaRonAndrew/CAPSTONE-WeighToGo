/**
 * BNS compliance schedule for Vitamin A and Deworming.
 *
 * 12-month brackets for display, 6-month dosing windows underneath:
 * - Vitamin A: "Single Dose" at 6-11mo, then 12-23 / 24-35 / 36-47 / 48-59
 *   with "First Dose" (bracket start .. start+5) + "Second Dose"
 *   (start+6 .. bracket end). E.g. 12-23 → First 12-17, Second 18-23.
 * - Deworming: same brackets starting at 12-23 (no 6-month dose).
 *
 * Dose-order mapping (unchanged — existing tbl_supplements rows keep working):
 * - Vitamin A: 1 = 6-11 single; 2/3 = 12-17 / 18-23; 4/5 = 24-29 / 30-35;
 *   6/7 = 36-41 / 42-47; 8/9 = 48-53 / 54-59.
 * - Deworming: 1/2 = 12-17 / 18-23; 3/4 = 24-29 / 30-35; 5/6 = 36-41 / 42-47;
 *   7/8 = 48-53 / 54-59.
 *
 * Rules:
 * - "Second Dose" is locked until its bracket's "First Dose" is recorded.
 * - Strict rule, no grace: the First Dose counts as on time ONLY when
 *   administered in the exact month its bracket opens (age in months ==
 *   bracket start, e.g. 12 for 12-23). Any later month — even inside the
 *   sub-window — voids the bracket's Second Dose as "missed": permanently
 *   disabled, never actionable. The child simply waits for the next
 *   bracket's First Dose.
 * - 6-month interval: once an on-time First is given at age F, Second opens
 *   at F+6. E.g. First at 12mo → Second opens at 18mo. Before that it is
 *   "waiting" (not actionable) with an opens-at month for the UI countdown.
 * - 1-month grace: a missed window stays "overdue" for 1 month past its end
 *   (age <= end+1) alongside the next window's dose, then "closed".
 * - Catch-up: a Second whose interval just matured stays "overdue" (not
 *   closed) even past its sub-window, so late First doses don't strand it.
 * - Anything older than grace (except that catch-up Second) is "closed".
 *   Future windows are "upcoming".
 * - Registration backfill: a child registered after a window opened is
 *   treated as having received every such dose exactly on schedule, so past
 *   windows never surface as a backlog and only future windows need a tap.
 */

const GRACE_MONTHS = 1;
const DOSE_INTERVAL_MONTHS = 6;
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

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

function getBrackets(supplementType) {
  if (supplementType === "Vitamin A") return VITAMIN_A_BRACKETS;
  if (supplementType === "Deworming") return DEWORMING_BRACKETS;
  throw new Error(`Unknown supplement type: ${supplementType}`);
}

function formatRequirement(slot, bracketLabel) {
  return `${slot} for ${bracketLabel}`;
}

// Each bracket's two slots split into fixed 6-month sub-windows so the
// dosing rhythm is visible even before anything is recorded.
function subWindow(bracket, slot) {
  if (slot === "Second Dose") {
    return { start_month: bracket.start_month + 6, end_month: bracket.end_month };
  }
  if (bracket.slots.length > 1) {
    return { start_month: bracket.start_month, end_month: bracket.start_month + 5 };
  }
  return { start_month: bracket.start_month, end_month: bracket.end_month };
}

function getScheduleWindows(supplementType) {
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

// Registration-time perfect-history assumption. A child who joins the
// program after one or more dose windows have already opened is treated as
// having received every one of those doses exactly on schedule, dated at
// `dob + window.start_month`. This keeps late registrations from being handed
// a First Dose that the strict on-time rule would immediately turn into a
// permanently missed Second Dose. Only windows at/before the registration age
// are seeded; every later window stays actionable when its turn arrives.
function buildRegistrationBackfill(dob, ageAtRegistration) {
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

function findWindow(doseWindows, doseOrder) {
  return doseWindows.find((w) => w.dose_order === doseOrder) || null;
}

function findBracketIndex(brackets, ageInMonths) {
  return brackets.findIndex((b) => ageInMonths >= b.start_month && ageInMonths <= b.end_month);
}

// Add N calendar months to a YYYY-MM-DD date, clamping to the target
// month's last day (e.g. 2025-08-31 + 6mo -> 2026-02-28). Used so the
// Second Dose unlocks exactly 6 months after the actual First Dose date.
function addMonthsToDateStr(dateStr, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) return null;
  const day = Number(m[3]);
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  target.setUTCDate(d);
  const y = target.getUTCFullYear();
  const mo = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

// Age (in months) at which a First Dose was given, for the 6-month interval.
// Prefers the stored age_in_months; falls back to dob+date_administered;
// queued (unsynced) rows carry neither, so they count as "just now".
function firstGivenAge(firstRecord, currentAge, childDob) {
  if (!firstRecord) return null;
  if (firstRecord.age_in_months !== undefined && firstRecord.age_in_months !== null) {
    const n = Number(firstRecord.age_in_months);
    if (Number.isFinite(n)) return n;
  }
  if (firstRecord.date_administered && childDob) {
    try {
      const { calculateAgeInMonths } = require("../utils/date");
      return calculateAgeInMonths(childDob, firstRecord.date_administered);
    } catch {
      return currentAge;
    }
  }
  return currentAge;
}

// Core per-dose state machine shared by schedule/due/compliance so the
// server, the offline mirror, and validation all agree.
//
// First Dose availability triggers on the bracket's starting month
// (sub-window start == bracket start). Second Dose unlocks strictly on the
// exact calendar date 6 months after the actual First Dose administration
// date — `todayStr` (YYYY-MM-DD) is compared against that unlock date, so
// a First given 2025-01-15 opens its Second on 2025-07-15, not merely "at
// 18 months old". Without usable dates it falls back to month arithmetic.
function resolveDoseStatus({ ageInMonths, window, bracketIndex, brackets, firstRecord, childDob, todayStr }) {
  const bracket = brackets[bracketIndex];
  const isSecond = window.slot === "Second Dose";
  const firstGiven = Boolean(firstRecord);
  const locked = isSecond && !firstGiven;

  // Strict rule, no grace: the First Dose unlocks its Second ONLY when given
  // in the exact month the bracket opens (e.g. at 12mo for 12-23). Any later
  // month voids the Second as permanently missed — the child waits for the
  // next bracket's First Dose instead.
  if (isSecond && firstGiven) {
    const fAge = firstGivenAge(firstRecord, ageInMonths, childDob);
    if (fAge !== bracket.start_month) {
      return { status: "missed", actionable: false, locked: false, opensAtMonth: null, opensOnDate: null };
    }
  }

  // 6-month interval gate for Second doses with a recorded First.
  let opensAtMonth = null;
  let opensOnDate = null;
  if (isSecond && firstGiven) {
    const fAge = firstGivenAge(firstRecord, ageInMonths, childDob);
    opensAtMonth = fAge + DOSE_INTERVAL_MONTHS;
    if (firstRecord.date_administered) {
      opensOnDate = addMonthsToDateStr(firstRecord.date_administered, DOSE_INTERVAL_MONTHS);
    }
    // Exact-date gate wins when both dates are known: the button unlocks
    // on the 6-month anniversary of the actual administration date.
    if (opensOnDate && todayStr && /^\d{4}-\d{2}-\d{2}/.test(todayStr)) {
      if (String(todayStr).slice(0, 10) < opensOnDate) {
        return { status: "waiting", actionable: false, locked: false, opensAtMonth, opensOnDate };
      }
    } else if (ageInMonths < opensAtMonth) {
      return { status: "waiting", actionable: false, locked: false, opensAtMonth, opensOnDate };
    }
    // Interval matured: Second stays catch-up-able (overdue, never closed)
    // even past its sub-window. (Only reachable for on-time Firsts — a late
    // First voids the Second as missed above.)
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

  // Past the sub-window: 1-month grace as "overdue", then "closed".
  if (ageInMonths <= window.end_month + GRACE_MONTHS) {
    // During grace the next window is already open, so both show at once.
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

  // First-dose record per bracket drives the Second-Dose lock + interval.
  const firstRecordByBracket = new Map();
  for (let i = 0; i < brackets.length; i++) {
    const bracketWindows = windows.filter((w) => {
      const b = brackets[i];
      return w.bracket_id === b.id;
    });
    const firstWindow = bracketWindows.find((w) => w.slot !== "Second Dose") || bracketWindows[0];
    const secondWindow = bracketWindows.find((w) => w.slot === "Second Dose");
    firstRecordByBracket.set(i, {
      firstRecord: firstWindow ? recordsByDose.get(firstWindow.dose_order) || null : null,
      secondRecord: secondWindow ? recordsByDose.get(secondWindow.dose_order) || null : null,
    });
  }

  return windows.map((window) => {
    const record = recordsByDose.get(window.dose_order) || null;
    const bracketIndex = brackets.findIndex((b) => b.id === window.bracket_id);
    const { firstRecord } = firstRecordByBracket.get(bracketIndex) || { firstRecord: null };

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
      };
    }

    // Legacy artefact: Second recorded but First missing. Such rows predate
    // the First→Second lock (earlier rules/windows let any dose be recorded
    // in any order), so the missing First is flagged `skipped` for the UI
    // instead of looking like an ordinary closed dose. New rows like this
    // are impossible: creating a Second without its First is rejected.
    if (window.slot !== "Second Dose") {
      const flags = firstRecordByBracket.get(bracketIndex) || {};
      if (flags.secondRecord && !flags.firstRecord) {
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
        };
      }
    }

    const resolved = resolveDoseStatus({
      ageInMonths,
      window,
      bracketIndex,
      brackets,
      firstRecord,
      childDob,
      todayStr,
    });

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
    };
  });
}

// Whether a recorded dose still shows its Undo control (24-hour window).
function isUndoableRecord(record, now = Date.now()) {
  if (!record) return false;
  if (record._queued) return true;
  const ts = record.created_at || record.updated_at || null;
  if (ts) {
    const t = new Date(ts).getTime();
    if (Number.isFinite(t)) return now - t < UNDO_WINDOW_MS;
    return false;
  }
  return false;
}

// `ageAtRegistration` grandfathers windows fully closed (incl. grace) before
// the child was registered. `childDob` + `todayStr` enable the exact-date
// 6-month interval math.
function getDueSupplements(ageInMonths, existingRecords = [], ageAtRegistration = ageInMonths, childDob = null, todayStr = null) {
  const due = [];

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const entries = buildDoseEntries(ageInMonths, existingRecords, supplementType, childDob, todayStr);
    for (const entry of entries) {
      if (!entry.actionable) continue;
      if (entry.window_end_month + GRACE_MONTHS < ageAtRegistration) {
        // Exception: a catch-up Second whose 6-month interval just matured
        // stays due even if its sub-window predates registration.
        const isCatchUpSecond = entry.slot === "Second Dose" && entry.status === "overdue";
        if (!isCatchUpSecond) continue;
      }
      due.push({
        supplement_type: entry.supplement_type,
        dose_order: entry.dose_order,
        window_start_month: entry.window_start_month,
        window_end_month: entry.window_end_month,
        bracket_id: entry.bracket_id,
        bracket_label: entry.bracket_label,
        slot: entry.slot,
        requirement: entry.requirement,
        overdue: entry.status === "overdue",
        opens_at_month: entry.opens_at_month,
        opens_on_date: entry.opens_on_date || null,
      });
    }
  }

  return due;
}

// Per-type compliance snapshot: what the BNS currently needs to give (or
// whether the child isn't eligible / is waiting on the 6-month interval /
// is up to date).
function getComplianceStatus(ageInMonths, existingRecords = [], childDob = null, todayStr = null) {
  const result = {};

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const brackets = getBrackets(supplementType);
    const entries = buildDoseEntries(ageInMonths, existingRecords, supplementType, childDob, todayStr);
    const eligible = ageInMonths >= brackets[0].start_month;

    if (!eligible) {
      result[supplementType] = { status: "not_eligible" };
      continue;
    }

    const actionable = entries.filter((e) => e.actionable);
    if (actionable.length > 0) {
      // Overdue (grace/catch-up) first so banners name urgency first.
      actionable.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));
      const next = actionable[0];
      result[supplementType] = {
        status: "due",
        dose_order: next.dose_order,
        overdue: next.status === "overdue",
        bracket_id: next.bracket_id,
        bracket_label: next.bracket_label,
        slot: next.slot,
        requirement: next.requirement,
        opens_at_month: next.opens_at_month,
        opens_on_date: next.opens_on_date || null,
        actionable: actionable.map((e) => ({
          dose_order: e.dose_order,
          bracket_id: e.bracket_id,
          bracket_label: e.bracket_label,
          slot: e.slot,
          requirement: e.requirement,
          overdue: e.status === "overdue",
        })),
      };
      continue;
    }

    const waiting = entries.filter((e) => e.status === "waiting");
    if (waiting.length > 0) {
      const next = waiting.slice().sort((a, b) => (a.opens_at_month || 0) - (b.opens_at_month || 0))[0];
      result[supplementType] = {
        status: "waiting",
        dose_order: next.dose_order,
        bracket_id: next.bracket_id,
        bracket_label: next.bracket_label,
        slot: next.slot,
        requirement: next.requirement,
        opens_at_month: next.opens_at_month,
        opens_on_date: next.opens_on_date || null,
      };
      continue;
    }

    result[supplementType] = { status: "complete" };
  }

  return result;
}

// Full dose-by-dose timeline for one child, merging the schedule windows
// with whatever is recorded in tbl_supplements.
function getSupplementSchedule(ageInMonths, existingRecords = [], childDob = null, todayStr = null) {
  const schedule = {};

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    schedule[supplementType] = buildDoseEntries(ageInMonths, existingRecords, supplementType, childDob, todayStr);
  }

  return schedule;
}

module.exports = {
  GRACE_MONTHS,
  DOSE_INTERVAL_MONTHS,
  UNDO_WINDOW_MS,
  getBrackets,
  getScheduleWindows,
  buildRegistrationBackfill,
  findWindow,
  addMonthsToDateStr,
  isUndoableRecord,
  getDueSupplements,
  getComplianceStatus,
  getSupplementSchedule,
};
