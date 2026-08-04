// tbl_children only stores a single `name` column, so split entry fields are
// combined into one "First Middle Last" string before the record is saved.
export function combineChildName({ firstName, middleName, lastName }) {
  const first = (firstName || "").trim();
  const middle = (middleName || "").trim();
  const last = (lastName || "").trim();
  return [first, middle, last].filter(Boolean).join(" ");
}

// Masterlist-style tables display names as "Last, First M." — parsed back
// out of the combined name (first token = first name, last token = last
// name, everything between is the middle name).
export function formatNameForTable(fullName) {
  const tokens = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return fullName || "";

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const middle = tokens.slice(1, -1).join(" ");
  const mi = middle ? `${middle[0].toUpperCase()}.` : "";

  return mi ? `${last}, ${first} ${mi}` : `${last}, ${first}`;
}
