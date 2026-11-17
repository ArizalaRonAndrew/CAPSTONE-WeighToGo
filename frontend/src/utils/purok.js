// Purok / Sitio labels are letter + number identifiers like "Purok 1" or
// "Purok 12B". Keep Unicode letters (e.g. "Ñ"), digits and spaces; strip
// every other character (punctuation, symbols, emoji) as the user types or
// pastes, so only letters and numbers can be saved.
const PUROK_PATTERN = /^[\p{L}\p{N} ]+$/u;

export function sanitizePurokInput(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .slice(0, 50);
}

export function normalizePurok(value) {
  return sanitizePurokInput(value).trim().replace(/\s+/g, " ");
}

export function isValidPurok(value) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  return normalized.length > 0 && PUROK_PATTERN.test(normalized);
}

export const PUROK_HINT = "Use letters and numbers only — no special characters.";
