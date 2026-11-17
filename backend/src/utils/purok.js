// Purok / Sitio labels are letter + number identifiers like "Purok 1" or
// "Purok 12B". Spaces are kept so words can be separated; punctuation,
// symbols and any other special characters are rejected.
const PUROK_PATTERN = /^[\p{L}\p{N} ]+$/u;

function normalizePurok(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isValidPurok(value) {
  const normalized = normalizePurok(value);
  return normalized.length > 0 && PUROK_PATTERN.test(normalized);
}

module.exports = { normalizePurok, isValidPurok };
