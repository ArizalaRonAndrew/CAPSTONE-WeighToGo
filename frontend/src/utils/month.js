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
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
