import { manilaDateParts } from "./month";

// dob is a plain "YYYY-MM-DD" date column value — split it directly rather
// than round-tripping through `new Date(dob)` and local getters, which
// previously misread it as the wrong calendar day on a browser/host set to
// a timezone behind UTC.
function dobParts(dob) {
  const [year, month, day] = String(dob).slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

export function ageInMonths(dob) {
  const birth = dobParts(dob);
  const now = manilaDateParts();
  let months = (now.year - birth.year) * 12 + (now.month - birth.month);
  if (now.day < birth.day) months -= 1;
  return Math.max(months, 0);
}

export function formatAge(dob) {
  const months = ageInMonths(dob);
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0) return `${remMonths} mo`;
  if (remMonths === 0) return `${years} yr`;
  return `${years} yr ${remMonths} mo`;
}
