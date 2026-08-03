export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function addMonths(monthString, count) {
  const [year, month] = monthString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
