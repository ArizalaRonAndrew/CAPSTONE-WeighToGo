// Person-name guard shared by child registration and parent/guardian names.
// Letters only: no digits and no special characters. Allowed on top of
// Unicode letters: spaces plus hyphen (-), apostrophe (' / ’) and period (.)
// so real names like "Dela Cruz", "Anne-Marie", "O'Brien", "Niña" or "Jr."
// still pass.
const PERSON_NAME_PATTERN = /^[\p{L}.'\-’ ]+$/u;

function isValidPersonName(value, { minLength = 2 } = {}) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < minLength) return false;
  if (!PERSON_NAME_PATTERN.test(trimmed)) return false;
  return /\p{L}/u.test(trimmed);
}

module.exports = { isValidPersonName, PERSON_NAME_PATTERN };
