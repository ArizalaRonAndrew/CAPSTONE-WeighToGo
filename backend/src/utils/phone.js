// PH mobile numbers: exactly 11 digits, always starting with "09" (e.g. 09171234567).
function isValidPhContact(value) {
  return /^09\d{9}$/.test(value || "");
}

module.exports = { isValidPhContact };
