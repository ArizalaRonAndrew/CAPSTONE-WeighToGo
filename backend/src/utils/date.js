function calculateAgeInMonths(dob, referenceDate = new Date()) {
  const birth = new Date(dob);
  const ref = new Date(referenceDate);

  let months = (ref.getFullYear() - birth.getFullYear()) * 12 + (ref.getMonth() - birth.getMonth());
  if (ref.getDate() < birth.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
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

module.exports = { calculateAgeInMonths, toMonthRange, addMonths, formatMonth, isValidMonthString };
