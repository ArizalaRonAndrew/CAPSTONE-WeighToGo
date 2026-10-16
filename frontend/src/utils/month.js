// Resolves "now" into Philippines-local YYYY-MM-DD components regardless of
// the browser's own timezone, so "today"/"this month" always match what the
// user actually sees on their clock — a checkup logged just after midnight
// local time was previously filed under the wrong day (and sometimes the
// wrong month) when computed from raw UTC. Mirrors backend/src/utils/date.js.
export function manilaDateParts(date = new Date()) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA formats as YYYY-MM-DD
  const [year, month, day] = formatted.split("-").map(Number);
  return { year, month, day };
}

export function todayInManila() {
  const { year, month, day } = manilaDateParts();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function currentMonth() {
  return todayInManila().slice(0, 7);
}

export function addMonths(monthString, count) {
  const [year, month] = monthString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(monthString) {
  const key = periodKeyForMonth(monthString);
  if (/^\d{4}-Q1$/.test(key)) return `January–March ${key.slice(0, 4)}`;
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Jan–Mar is a single on-time assessment period (Q1): one checkup per child
// for the whole quarter. Mirrors backend/src/utils/date.js — Jan/Feb/Mar of
// the same year collapse to "YYYY-Q1" so duplicate checks, reports, and the
// admin trend line all agree those three months are one assessment window.
export function isQ1Month(monthString) {
  if (!/^\d{4}-\d{2}$/.test(monthString || "")) return false;
  const month = Number(monthString.slice(5, 7));
  return month >= 1 && month <= 3;
}

export function periodKeyForMonth(monthString) {
  if (!monthString) return monthString;
  if (/^\d{4}-Q1$/.test(monthString)) return monthString;
  if (!/^\d{4}-\d{2}$/.test(monthString)) return monthString;
  return isQ1Month(monthString) ? `${monthString.slice(0, 4)}-Q1` : monthString;
}

export function periodKeyForDate(dateMeasured) {
  if (!dateMeasured) return null;
  if (typeof dateMeasured === "string" && dateMeasured.length >= 7) {
    return periodKeyForMonth(dateMeasured.slice(0, 7));
  }
  return null;
}

export function expandPeriodToMonths(periodOrMonth) {
  if (!periodOrMonth) return [];
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) {
    const year = key.slice(0, 4);
    return [`${year}-01`, `${year}-02`, `${year}-03`];
  }
  return [periodOrMonth];
}

// Assessment-period list between two "YYYY-MM" months (inclusive), with
// Jan–Mar collapsed to a single "YYYY-Q1" entry.
export function periodsBetween(from, to) {
  const out = [];
  const seen = new Set();
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 36) {
    const key = periodKeyForMonth(cursor);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return out;
}

export function periodLabel(periodOrMonth) {
  return monthLabel(periodOrMonth);
}

export function periodShortLabel(periodOrMonth) {
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) return "Jan–Mar";
  const [, month] = key.split("-").map(Number);
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
}
