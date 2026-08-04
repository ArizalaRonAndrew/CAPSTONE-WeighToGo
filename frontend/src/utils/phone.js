// PH mobile numbers: exactly 11 digits, always starting with "09" (e.g. 09171234567).

export function sanitizePhoneInput(value) {
  return (value || "").replace(/\D/g, "").slice(0, 11);
}

export function isValidPhContact(value) {
  return /^09\d{9}$/.test(value || "");
}

export function formatPhContact(value) {
  const digits = sanitizePhoneInput(value);
  if (digits.length !== 11) return value || "";
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}
