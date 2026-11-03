// Names must be letters only: no digits (0-9) and no special characters
// (@ # $ % ^ & * ( ) _ + = { } [ ] | \ / < > ~ ` ! ? : ; , " etc.).
// Allowed on top of Unicode letters: spaces plus hyphen (-), apostrophe
// (' / ’) and period (.) so real names like "Dela Cruz", "Anne-Marie",
// "O'Brien", "Niña" or "Jr." still pass.
const PERSON_NAME_PATTERN = /^[\p{L}.'\-’ ]+$/u;
const ROMAN_SUFFIX_PATTERN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)\.?$/i;

// Strip anything a name field must never contain as the user types/pastes.
// Digits and disallowed symbols are dropped; allowed letters, spaces,
// hyphens, apostrophes and periods are kept as-is (no auto-trim while typing).
function sanitizeName(value) {
  return (value || "").replace(/[^\p{L}.'\-’ ]/gu, "");
}

export function sanitizeNameInput(value) {
  return sanitizeName(value).slice(0, 50);
}

export function titleCasePersonName(value) {
  const cleaned = sanitizeName(value).trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  const words = cleaned.split(" ");
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === words.length - 1 && ROMAN_SUFFIX_PATTERN.test(word)) {
        return lower.toUpperCase();
      }
      return lower.replace(/(^|[.'’-])(\p{L})/gu, (_, separator, letter) =>
        `${separator}${letter.toUpperCase()}`
      );
    })
    .join(" ");
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
const SUFFIX_TOKEN = new Set(["jr", "sr", "i", "ii", "iii", "iv", "v"]);

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
  const first = titleCasePersonName(firstName);
  const middle = titleCasePersonName(middleName);
  const last = titleCasePersonName(lastName);
  const ext = titleCasePersonName(suffix);
  return [first, middle, last, ext].filter(Boolean).join(" ");
}

// Masterlist-style tables display names as "Last, First Middle Suffix" — parsed back
// out of the combined name (first token = first name, last token = last
// name, everything between is the middle name). A trailing suffix
// (Jr./Sr./II/III/...) is detected first and re-appended at the end.
export function formatNameForTable(fullName) {
  const formattedName = titleCasePersonName(fullName);
  const tokens = formattedName.split(/\s+/).filter(Boolean);
  const { core, suffix } = stripSuffixToken(tokens);
  if (core.length < 2) return formattedName;

  const first = core[0];
  const last = core[core.length - 1];
  const middle = core.slice(1, -1).join(" ");

  return [`${last}, ${first}`, middle, suffix].filter(Boolean).join(" ");
}
