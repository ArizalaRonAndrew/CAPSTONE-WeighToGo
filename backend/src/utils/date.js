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
  addMonths,
  formatMonth,
  isValidMonthString,
};
