// Whitelists an update payload down to a known-safe set of fields before it
// reaches the DB layer. Without this, a raw `req.body` passed straight to
// Supabase's `.update()` lets a caller smuggle in fields like `child_id` or
// `submission_status` that the barangay-access check never validated.
function pickFields(source, allowedKeys) {
  const result = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

module.exports = { pickFields };
