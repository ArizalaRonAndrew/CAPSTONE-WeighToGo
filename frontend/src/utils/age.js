import { manilaDateParts } from "./month";

// dob is a plain "YYYY-MM-DD" date column value — split it directly rather
// than round-tripping through `new Date(dob)` and local getters, which
// previously misread it as the wrong calendar day on a browser/host set to
// a timezone behind UTC.
function dobParts(dob) {
  const [year, month, day] = String(dob).slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

// Age on an arbitrary date — needed for registration-time backfill, where the
// cutoff must be the registration instant rather than "now" (an offline
// registration may sync days or weeks later).
export function ageInMonthsOn(dob, referenceDate = new Date()) {
  const birth = dobParts(dob);
  const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const now = manilaDateParts(Number.isNaN(refDate.getTime()) ? new Date() : refDate);
  let months = (now.year - birth.year) * 12 + (now.month - birth.month);
  if (now.day < birth.day) months -= 1;
  return Math.max(months, 0);
}

export function ageInMonths(dob) {
  return ageInMonthsOn(dob);
}

export function formatAge(dob) {
  const months = ageInMonths(dob);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} mo`;
  if (remMonths === 0) return `${years} yr`;
  return `${years} yr ${remMonths} mo`;
}
