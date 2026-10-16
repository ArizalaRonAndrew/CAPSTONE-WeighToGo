// Resolves any date-ish input into plain {year, month, day} calendar
// components with no local-timezone ambiguity:
// - A bare "YYYY-MM-DD" string (dob, date_measured, ...) is already an
//   unambiguous calendar date — split it directly rather than round-tripping
//   through `new Date()`, which parses it as UTC midnight and would then
//   read back as the *previous* calendar day under a negative UTC offset
//   host (e.g. a US-region server) if read with local getters.
// - Anything else (a real instant: a Date object, "now", or a full
//   timestamptz string) is resolved against Asia/Manila — this app's one
//   real-world timezone — so "today" always matches what a user actually
//   sees on their clock in the Philippines, regardless of what timezone the
//   server or browser host happens to be running in.
function dateParts(input) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split("-").map(Number);
    return { year, month, day };
  }
  const date = input instanceof Date ? input : new Date(input);
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date); // en-CA formats as YYYY-MM-DD
  const [year, month, day] = formatted.split("-").map(Number);
  return { year, month, day };
}

function calculateAgeInMonths(dob, referenceDate = new Date()) {
  const birth = dateParts(dob);
  const ref = dateParts(referenceDate);

  let months = (ref.year - birth.year) * 12 + (ref.month - birth.month);
  if (ref.day < birth.day) {
    months -= 1;
  }
  return Math.max(months, 0);
}

// "Today" as a YYYY-MM-DD string in Philippines local time — use this
// instead of `new Date().toISOString().slice(0, 10)` (UTC) for any
// business-logic default (e.g. "date this checkup/dose was recorded"),
// since near midnight those two can disagree by a full calendar day.
function todayInManila() {
  const { year, month, day } = dateParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Jan–Mar is a single on-time assessment period (Q1): one checkup per child
// for the whole quarter. Helpers below collapse Jan/Feb/Mar into one bucket
// ("YYYY-Q1") so duplicate checks, reports, and the admin trend line all
// agree that those three months are one assessment window.
function isQ1Month(monthString) {
  if (!/^\d{4}-\d{2}$/.test(monthString || "")) return false;
  const month = Number(monthString.slice(5, 7));
  return month >= 1 && month <= 3;
}

function isValidPeriodString(value) {
  return /^\d{4}-Q1$/.test(value || "") || /^\d{4}-\d{2}$/.test(value || "");
}

// Canonical assessment-period key for a "YYYY-MM" month: Jan/Feb/Mar of the
// same year all map to "YYYY-Q1"; every other month maps to itself.
function periodKeyForMonth(monthString) {
  if (!monthString) return monthString;
  if (/^\d{4}-Q1$/.test(monthString)) return monthString;
  if (!isValidMonthString(monthString)) return monthString;
  const year = monthString.slice(0, 4);
  return isQ1Month(monthString) ? `${year}-Q1` : monthString;
}

// Canonical assessment-period key for a measurement date (YYYY-MM-DD string,
// Date, or timestamptz). Jan–Mar dates collapse to "YYYY-Q1".
function periodKeyForDate(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
    return periodKeyForMonth(dateLike.slice(0, 7));
  }
  if (typeof dateLike === "string" && /^\d{4}-\d{2}$/.test(dateLike)) {
    return periodKeyForMonth(dateLike);
  }
  return periodKeyForMonth(formatMonth(dateLike));
}

// All calendar months covered by a period key: Q1 expands to Jan+Feb+Mar.
function expandPeriodToMonths(periodOrMonth) {
  if (!periodOrMonth) return [];
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) {
    const year = key.slice(0, 4);
    return [`${year}-01`, `${year}-02`, `${year}-03`];
  }
  if (!/^\d{4}-\d{2}$/.test(periodOrMonth) && !/^\d{4}-Q1$/.test(periodOrMonth)) return [];
  return [periodOrMonth];
}

// Assessment-period list between two "YYYY-MM" months (inclusive),
// with Jan–Mar collapsed to a single "YYYY-Q1" entry. E.g.
// periodsBetween("2026-01", "2026-12") -> ["2026-Q1","2026-04",...,"2026-12"].
function periodsBetween(from, to) {
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

// Human labels: "2026-Q1" -> "Jan–Mar 2026" / "Jan–Mar".
function periodLabel(periodOrMonth) {
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) return `Jan–Mar ${key.slice(0, 4)}`;
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function periodShortLabel(periodOrMonth) {
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) return "Jan–Mar";
  const [, month] = key.split("-").map(Number);
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

function isValidMonthString(monthString) {
  return /^\d{4}-\d{2}$/.test(monthString || "");
}

// start/end are exclusive-end DATE strings (YYYY-MM-DD), for filtering
// Postgres date columns with .gte(start).lt(end).
function toMonthRange(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Period-aware range for assessment queries: a Jan/Feb/Mar (or "YYYY-Q1")
// selection covers the whole Jan 1 – Apr 1 quarter, since that window holds
// just one assessment per child. Any other month behaves like toMonthRange.
function toPeriodRange(periodOrMonth) {
  const key = periodKeyForMonth(periodOrMonth);
  if (/^\d{4}-Q1$/.test(key)) {
    const year = Number(key.slice(0, 4));
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 3, 1));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  return toMonthRange(periodOrMonth);
}

function addMonths(monthString, count) {
  const [year, month] = monthString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(dateLike) {
  const date = new Date(dateLike);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

module.exports = {
  calculateAgeInMonths,
  todayInManila,
  toMonthRange,
  toPeriodRange,
  addMonths,
  formatMonth,
  isValidMonthString,
  isValidPeriodString,
  isQ1Month,
  periodKeyForMonth,
  periodKeyForDate,
  expandPeriodToMonths,
  periodsBetween,
  periodLabel,
  periodShortLabel,
};
