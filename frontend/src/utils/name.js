// Names must be letters only: no digits (0-9) and no special characters
// (@ # $ % ^ & * ( ) _ + = { } [ ] | \ / < > ~ ` ! ? : ; , " etc.).
// Allowed on top of Unicode letters: spaces plus hyphen (-), apostrophe
// (' / ’) and period (.) so real names like "Dela Cruz", "Anne-Marie",
// "O'Brien", "Niña" or "Jr." still pass.
const PERSON_NAME_PATTERN = /^[\p{L}.'\-’ ]+$/u;

// Strip anything a name field must never contain as the user types/pastes.
// Digits and disallowed symbols are dropped; allowed letters, spaces,
// hyphens, apostrophes and periods are kept as-is (no auto-trim while typing).
export function sanitizeNameInput(value) {
  return (value || "").replace(/[^\p{L}.'\-’ ]/gu, "").slice(0, 50);
}

// Strict check used on submit: at least one letter, only allowed chars,
// and a sensible trimmed length. Middle names are optional, so callers pass
// minLength 1 for them and 2 for required names.
export function isValidPersonName(value, { minLength = 2 } = {}) {
  const trimmed = (value || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < minLength) return false;
  if (!PERSON_NAME_PATTERN.test(trimmed)) return false;
  return /\p{L}/u.test(trimmed);
}

export const PERSON_NAME_HINT = "Use letters only — no numbers or special characters.";

// Allowed name extensions (suffixes). Kept as a closed list so the
// registration form can offer them as a dropdown instead of free text
// (which would re-open the numbers/special-characters problem).
export const NAME_SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV", "V"];

export function isNameSuffix(value) {
  return NAME_SUFFIXES.includes(value || "");
}

// Suffix tokens are stripped before parsing "Last, First M." so
// "Juan Santos Dela Cruz Jr." displays as "Dela Cruz, Juan S. Jr."
// instead of mistaking "Jr." for the last name.
const SUFFIX_TOKEN = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

function stripSuffixToken(tokens) {
  if (!tokens.length) return { core: tokens, suffix: "" };
  const last = tokens[tokens.length - 1].replace(/\./g, "").toLowerCase();
  if (SUFFIX_TOKEN.has(last)) {
    return { core: tokens.slice(0, -1), suffix: tokens[tokens.length - 1] };
  }
  return { core: tokens, suffix: "" };
}

// tbl_children only stores a single `name` column, so split entry fields are
// combined into one "First Middle Last Suffix" string before the record is saved.
export function combineChildName({ firstName, middleName, lastName, suffix }) {
  const first = (firstName || "").trim();
  const middle = (middleName || "").trim();
  const last = (lastName || "").trim();
  const ext = (suffix || "").trim();
  return [first, middle, last, ext].filter(Boolean).join(" ");
}

// Masterlist-style tables display names as "Last, First M." — parsed back
// out of the combined name (first token = first name, last token = last
// name, everything between is the middle name). A trailing suffix
// (Jr./Sr./II/III/...) is detected first and re-appended at the end.
export function formatNameForTable(fullName) {
  const tokens = (fullName || "").trim().split(/\s+/).filter(Boolean);
  const { core, suffix } = stripSuffixToken(tokens);
  if (core.length < 2) return fullName || "";

  const first = core[0];
  const last = core[core.length - 1];
  const middle = core.slice(1, -1).join(" ");
  const mi = middle ? `${middle[0].toUpperCase()}.` : "";
  const suffixPart = suffix ? ` ${suffix}` : "";

  return mi ? `${last}, ${first} ${mi}${suffixPart}` : `${last}, ${first}${suffixPart}`;
}
