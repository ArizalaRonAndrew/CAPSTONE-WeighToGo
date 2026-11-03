// Person-name guard shared by child registration and parent/guardian names.
// Letters only: no digits and no special characters. Allowed on top of
// Unicode letters: spaces plus hyphen (-), apostrophe (' / ’) and period (.)
// so real names like "Dela Cruz", "Anne-Marie", "O'Brien", "Niña" or "Jr."
// still pass.
const PERSON_NAME_PATTERN = /^[\p{L}.'\-’ ]+$/u;
const ROMAN_SUFFIX_PATTERN = /^(?:i{1,3}|iv|v|vi{0,3}|ix|x)\.?$/i;

function formatPersonName(value) {
  const cleaned = String(value || "")
    .replace(/[^\p{L}.'\-’ ]/gu, "")
    .trim()
    .replace(/\s+/g, " ");
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

function isValidPersonName(value, { minLength = 2 } = {}) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < minLength) return false;
  if (!PERSON_NAME_PATTERN.test(trimmed)) return false;
  return /\p{L}/u.test(trimmed);
}

module.exports = { formatPersonName, isValidPersonName, PERSON_NAME_PATTERN };
