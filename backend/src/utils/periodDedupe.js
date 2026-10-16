// Jan–Mar is one assessment month: regardless of whether the checkup was
// dated in January, February, or March, a child must count exactly once for
// that quarter. The database consolidation script removes the extra rows
// permanently, but reports must also stay correct while duplicates still
// exist — so every tally path collapses to one record per (child, period).
const { periodKeyForDate } = require("./date");

// Keeps the earliest measurement per (child_id, period); ties break by id so
// the result is deterministic and matches scripts/consolidateQ1Assessments.js
// (keep earliest, soft-reject the rest). If any duplicate in the group was
// already submitted, the kept row is treated as submitted — mirroring the
// script's promote-kept-to-submitted step so submit state doesn't flip.
function dedupeByChildPerPeriod(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const best = new Map();
  const bestSubmitted = new Map();
  const noKey = [];
  for (const row of rows) {
    const childId = row.child_id ?? row.childId;
    if (!childId || !row.date_measured) {
      noKey.push(row);
      continue;
    }
    const period = periodKeyForDate(row.date_measured);
    if (!period) {
      noKey.push(row);
      continue;
    }
    const key = `${childId}|${period}`;
    const prev = best.get(key);
    if (!prev) {
      best.set(key, row);
      bestSubmitted.set(key, row.submission_status === "submitted");
      continue;
    }
    if (row.submission_status === "submitted") bestSubmitted.set(key, true);
    const cmp =
      String(row.date_measured).localeCompare(String(prev.date_measured)) ||
      String(row.id ?? "").localeCompare(String(prev.id ?? ""));
    if (cmp < 0) best.set(key, row);
  }
  const out = [];
  for (const [key, row] of best) {
    if (bestSubmitted.get(key) && row.submission_status !== "submitted") {
      out.push({ ...row, submission_status: "submitted" });
    } else {
      out.push(row);
    }
  }
  return [...out, ...noKey];
}

module.exports = { dedupeByChildPerPeriod };
