// Restricts free-text measurement input (weight/height) to digits and a
// single decimal point, capped at maxLength characters.
export function sanitizeDecimalInput(value, maxLength = 5) {
  let cleaned = (value || "").replace(/[^0-9.]/g, "");

  const dotIndex = cleaned.indexOf(".");
  if (dotIndex !== -1) {
    cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, "");
  }

  return cleaned.slice(0, maxLength);
}
