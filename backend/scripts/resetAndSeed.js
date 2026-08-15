require("dotenv").config();

const bcrypt = require("bcryptjs");
const supabase = require("../src/config/supabase");
const barangays = require("../src/data/barangays.json");
const { weightForAgeZ, heightForAgeZ } = require("../src/services/growthReference");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const { calculateAgeInMonths, todayInManila, addMonths } = require("../src/utils/date");
const { getScheduleWindows } = require("../src/services/supplementSchedule.service");
const { WEIGHT_RANGE, HEIGHT_RANGE } = require("../src/utils/measurements");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const CHILDREN_PER_BARANGAY_MIN = 100;
const CHILDREN_PER_BARANGAY_MAX = 150;
const BNS_PASSWORD = "Barangay@2026";
const CHUNK_SIZE = 500;

// Barangay Map public-health-significance severity buckets (see
// backend/src/utils/publicHealthSignificance.js). "very-low" is deliberately
// excluded: underweight has no very-low tier in the WHO/UNICEF 1995 scale
// (its floor is "low" even at 0%), and the map's overall severity is the
// WORST of underweight/stunted/wasted/overweight, so "very-low" can never
// actually appear for a barangay that has any submitted assessments — it's
// only reachable in the app's own logic as an unused floor value.
const SEVERITY_SCENARIOS = ["no-data", "low", "medium", "high", "very-high"];
// Fraction of a barangay's children steered toward a proportionate
// underweight+stunted growth profile, calibrated by Monte-Carlo simulation
// against the real classification/threshold code so each lands in its
// target WHO tier (see conversation notes) rather than guessed analytically.
const SCENARIO_TARGET_FRACTION = { low: 0.06, medium: 0.15, high: 0.25, "very-high": 0.40 };
// Coverage is meant to be near-complete: only a couple of barangays are kept
// as a deliberate "no-data" map demo, and every other barangay leaves just a
// small, fixed handful of children genuinely unassessed this month (not
// merely unsubmitted) rather than a large random fraction.
const NO_DATA_BARANGAY_COUNT = 2;
const UNASSESSED_PER_BARANGAY_MIN = 5;
const UNASSESSED_PER_BARANGAY_MAX = 10;

function buildScenarioRotation(count) {
  const nonNoData = SEVERITY_SCENARIOS.filter((s) => s !== "no-data");
  const rotation = Array.from({ length: NO_DATA_BARANGAY_COUNT }, () => "no-data");
  for (let i = 0; rotation.length < count; i++) {
    rotation.push(nonNoData[i % nonNoData.length]);
  }
  // Fisher-Yates shuffle so scenarios aren't clustered alphabetically on the map.
  for (let i = rotation.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [rotation[i], rotation[j]] = [rotation[j], rotation[i]];
  }
  return rotation;
}

// ---------- name data ----------
const BOY_NAMES = [
  "Juan", "Jose", "Miguel", "Gabriel", "Rafael", "Antonio", "Marco", "Angelo",
  "Carlo", "Daniel", "Emmanuel", "Francis", "Gerald", "Ivan", "Jacob", "Joshua",
  "Kian", "Leo", "Mark", "Nathan", "Paolo", "Quennie", "Renz", "Samuel",
  "Timothy", "Vince", "Xander", "Zack", "Elijah", "Aldrin", "Bryan", "Christian",
  "Dominic", "Enzo", "Frederick", "Gio", "Harold", "Ian", "Jayson", "Kyle",
];
const GIRL_NAMES = [
  "Maria", "Ana", "Sofia", "Isabel", "Angel", "Bea", "Carmela", "Diana",
  "Ella", "Faith", "Grace", "Hannah", "Ivy", "Joy", "Kate", "Liza",
  "Mikaela", "Nicole", "Olivia", "Precious", "Queenie", "Rica", "Samantha", "Trisha",
  "Uma", "Vera", "Wynona", "Ysabel", "Zoe", "Alyssa", "Bianca", "Charlene",
  "Denise", "Erika", "Francine", "Gwyneth", "Honey", "Irish", "Janna", "Kristine",
];
const SURNAMES = [
  "Reyes", "Santos", "Cruz", "Bautista", "Ocampo", "Garcia", "Torres", "Ramos",
  "Villanueva", "Mendoza", "Castillo", "Aquino", "Del Rosario", "Salazar", "Navarro",
  "Pascual", "Gonzales", "Marquez", "Fernandez", "Domingo", "Rivera", "De Leon",
  "Aguilar", "Ilagan", "Malabanan", "Mercado", "Panganiban", "Umali", "Manalo",
  "Bernardo", "Concepcion", "Dizon", "Espiritu", "Flores", "Gutierrez", "Herrera",
  "Isip", "Javier", "Katigbak", "Lopez", "Macaraeg", "Nolasco", "Ople",
];
const PUROKS = [
  "Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5", "Purok 6", "Purok 7",
  "Sitio Ilog", "Sitio Bukid", "Sitio Maligaya",
];

// ---------- small helpers ----------
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChoice(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function gaussian(mean = 0, sd = 1) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}
function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
function phConTact() {
  let digits = "";
  for (let i = 0; i < 9; i++) digits += randInt(0, 9);
  return `09${digits}`;
}

// Bisection inverse of a monotonically-increasing z-score function, so we
// can go from a target WHO z-score back to a plausible raw measurement using
// the exact same LMS tables/formula the app uses to classify assessments.
function inverseZ(zFn, targetZ, lo, hi, iterations = 60) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (zFn(mid) < targetZ) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

// Per-child growth "profile" — a target weight/height z-score pair that
// stays roughly consistent across that child's monthly checkups, so a
// child's history doesn't flip between Normal and Severely Underweight
// month to month.
//
// zW/zH are drawn from a SHARED base + small independent noise rather than
// two fully independent gaussians: two independent draws let weight and
// height drift apart by chance, which (via the WHO weight-for-height
// reference) reads as wasting/overweight even when the intent was a plain
// proportionate profile — that cross-contamination was throwing off the
// calibrated barangay-level target fractions below.
function correlatedZPair(base, spread) {
  return { zW: base + gaussian(0, spread), zH: base + gaussian(0, spread) };
}

// A fixed small baseline (independent of barangay scenario) that gives every
// barangay a bit of individual-record variety — some wasted-only and
// overweight/obese children — without being large enough to become the
// barangay's dominant (worst-tier) indicator on its own.
function baselineProfile() {
  const r = Math.random();
  if (r < 0.03) return { zW: gaussian(-2.3, 0.3), zH: gaussian(0, 0.3) }; // wasted-only
  if (r < 0.06) {
    return Math.random() < 0.7
      ? { zW: gaussian(2.3, 0.3), zH: gaussian(2.0, 0.4) } // overweight
      : { zW: gaussian(3.4, 0.25), zH: gaussian(0.3, 0.3) }; // obese
  }
  return null; // not part of the fixed baseline this time
}

// Picks a child's growth profile so that, in aggregate across a barangay,
// the underweight/stunted prevalence lands in the barangay's target WHO
// public-health-significance tier (see SCENARIO_TARGET_FRACTION) — this is
// what drives the Barangay Map's severity color for that barangay.
function pickProfileForScenario(scenario) {
  const baseline = baselineProfile();
  if (baseline) return baseline;

  const targetFraction = SCENARIO_TARGET_FRACTION[scenario] ?? 0;
  if (Math.random() < targetFraction) {
    return correlatedZPair(gaussian(-2.4, 0.3), 0.1); // proportionate underweight+stunted driver
  }
  return correlatedZPair(gaussian(0, 0.6), 0.15); // normal
}

function measurementsForZ(gender, ageInMonths, zW, zH) {
  const weight = inverseZ(
    (x) => weightForAgeZ(gender, ageInMonths, x),
    clamp(zW, -4, 4),
    WEIGHT_RANGE.min,
    WEIGHT_RANGE.max
  );
  const height = inverseZ(
    (x) => heightForAgeZ(gender, ageInMonths, x),
    clamp(zH, -4, 4),
    HEIGHT_RANGE.min,
    HEIGHT_RANGE.max
  );
  return { weight: round1(clamp(weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max)), height: round1(clamp(height, HEIGHT_RANGE.min, HEIGHT_RANGE.max)) };
}

async function deleteAll(table) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`);
}

async function insertChunked(table, rows, selectCols) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.from(table).insert(chunk).select(selectCols || "id");
    if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
    out.push(...data);
  }
  return out;
}

function buildChild(barangayName, scenario) {
  const isMale = Math.random() < 0.5;
  const gender = isMale ? "Male" : "Female";
  const firstName = isMale ? randChoice(BOY_NAMES) : randChoice(GIRL_NAMES);
  const surname = randChoice(SURNAMES);
  const parentSurname = Math.random() < 0.7 ? surname : randChoice(SURNAMES);
  const parentFirst = Math.random() < 0.5 ? randChoice(BOY_NAMES) : randChoice(GIRL_NAMES);

  const currentAgeMonths = randInt(0, 58);
  const todayMonth = todayInManila().slice(0, 7);
  const dobMonth = addMonths(todayMonth, -currentAgeMonths);
  const dob = `${dobMonth}-${String(randInt(1, 28)).padStart(2, "0")}`;

  return {
    name: `${firstName} ${surname}`,
    dob,
    parent_name: `${parentFirst} ${parentSurname}`,
    parent_contact: Math.random() < 0.95 ? phConTact() : null,
    barangay: barangayName,
    purok: randChoice(PUROKS),
    gender,
    is_ip: Math.random() < 0.06,
    _profile: pickProfileForScenario(scenario),
    // "no-data" barangays must show zero SUBMITTED assessments for the
    // current calendar month (the Barangay Map only counts submitted rows),
    // so every child there has their current-month checkup forced to draft
    // regardless of the normal random submission mix.
    _forceCurrentMonthDraft: scenario === "no-data",
  };
}

function buildAssessmentsForChild(child) {
  const today = todayInManila();
  const todayMonth = today.slice(0, 7);
  const currentAge = calculateAgeInMonths(child.dob, today);
  if (currentAge < 0) return [];

  // _skipThisMonth is how the small "not yet assessed" quota per barangay is
  // realized: that child simply gets no record at all for the current
  // month, starting their history one month back instead. A newborn this
  // month (currentAge 0) has no earlier month to fall back to, so they end
  // up with zero assessments — a genuinely unassessed child, which is the
  // most realistic version of "not assessed yet" anyway.
  const skip = !!child._skipThisMonth;
  const startK = skip ? 1 : 0;
  if (skip && currentAge < 1) return [];

  const maxMonthsBack = Math.min(4, currentAge + 1 - startK);
  const monthsBack = randInt(1, Math.max(1, maxMonthsBack));
  const rows = [];

  for (let i = 0; i < monthsBack; i++) {
    const k = startK + i;
    const monthStr = addMonths(todayMonth, -k);
    const date_measured = `${monthStr}-05`;
    const age_in_months = calculateAgeInMonths(child.dob, date_measured);
    if (age_in_months > 60) continue;

    // Shared jitter applied to both zW and zH keeps weight/height moving
    // together month to month — independent jitter on each would introduce
    // artificial weight-for-height drift (read as wasting/overweight) that
    // was never part of the child's actual profile.
    const monthlyShift = gaussian(0, 0.08);
    const zW = clamp(child._profile.zW + monthlyShift + gaussian(0, 0.04), -4, 4);
    const zH = clamp(child._profile.zH + monthlyShift + gaussian(0, 0.04), -4, 4);
    const { weight, height } = measurementsForZ(child.gender, age_in_months, zW, zH);

    const { wfa_status, hfa_status, wfl_h_status } = classifyNutritionStatus({
      sex: child.gender,
      ageInMonths: age_in_months,
      weightKg: weight,
      heightCm: height,
    });

    // Current-month coverage is meant to be near-complete: only the small
    // per-barangay "not assessed" quota (handled via _skipThisMonth above)
    // and the deliberate "no-data" barangays stay unsubmitted this month.
    const submission_status = k === 0 && child._forceCurrentMonthDraft ? "draft" : "submitted";

    rows.push({
      child_id: child.id,
      date_measured,
      weight,
      height,
      age_in_months,
      wfa_status,
      hfa_status,
      wfl_h_status,
      submission_status,
    });
  }
  return rows;
}

function buildSupplementsForChild(child) {
  const today = todayInManila();
  const currentAge = calculateAgeInMonths(child.dob, today);
  const dobMonth = child.dob.slice(0, 7);
  const rows = [];

  for (const supplementType of ["Vitamin A", "Deworming"]) {
    const windows = getScheduleWindows(supplementType);
    for (const w of windows) {
      if (currentAge < w.start_month) break;
      // ~75% administration rate: leaves realistic gaps for compliance/overdue testing.
      if (Math.random() >= 0.75) continue;

      const givenAt = randInt(w.start_month, Math.min(w.end_month, currentAge));
      const date_administered = `${addMonths(dobMonth, givenAt)}-10`;
      if (date_administered > today) continue;
      const age_in_months = calculateAgeInMonths(child.dob, date_administered);

      rows.push({
        child_id: child.id,
        supplement_type: supplementType,
        dose_order: w.dose_order,
        age_in_months,
        date_administered,
      });
    }
  }
  return rows;
}

async function main() {
  console.log("=== WeighToGo: reset + seed ===\n");

  console.log("Reading existing tbl_users...");
  const { data: existingUsers, error: usersErr } = await supabase
    .from("tbl_users")
    .select("email, role, assigned_barangay, status");
  if (usersErr) throw new Error(`Failed to read tbl_users: ${usersErr.message}`);

  const alreadyAssigned = new Set(
    existingUsers.filter((u) => u.role === "BNS" && u.assigned_barangay).map((u) => u.assigned_barangay)
  );
  console.log(`  ${existingUsers.length} existing user(s). Barangays already with a BNS account: ${[...alreadyAssigned].join(", ") || "none"}\n`);

  console.log("Clearing tbl_supplements, tbl_assessments, tbl_children...");
  await deleteAll("tbl_supplements");
  await deleteAll("tbl_assessments");
  await deleteAll("tbl_children");
  console.log("  done.\n");

  console.log(`Generating children for ${barangays.length} barangays...`);
  const scenarioRotation = buildScenarioRotation(barangays.length);
  console.log(
    `  ${NO_DATA_BARANGAY_COUNT} barangay(s) kept as a deliberate "no-data" map demo; every other barangay leaves ` +
      `only ${UNASSESSED_PER_BARANGAY_MIN}-${UNASSESSED_PER_BARANGAY_MAX} children unassessed this month.\n`
  );
  let allInsertedChildren = [];
  const scenarioByBarangay = {};
  for (let idx = 0; idx < barangays.length; idx++) {
    const b = barangays[idx];
    const scenario = scenarioRotation[idx];
    scenarioByBarangay[b.name] = scenario;

    const n = randInt(CHILDREN_PER_BARANGAY_MIN, CHILDREN_PER_BARANGAY_MAX);
    const drafts = Array.from({ length: n }, () => buildChild(b.name, scenario));

    // Pick a small, fixed number of children to genuinely skip this month's
    // checkup (not just leave unsubmitted) — the "not assessed yet" quota.
    // "no-data" barangays already have every child unsubmitted this month
    // via _forceCurrentMonthDraft, so this quota is redundant there.
    if (scenario !== "no-data") {
      const unassessedCount = Math.min(n, randInt(UNASSESSED_PER_BARANGAY_MIN, UNASSESSED_PER_BARANGAY_MAX));
      const indices = new Set();
      while (indices.size < unassessedCount) indices.add(randInt(0, n - 1));
      indices.forEach((i) => {
        drafts[i]._skipThisMonth = true;
      });
    }

    const toInsert = drafts.map(({ _profile, _forceCurrentMonthDraft, _skipThisMonth, ...rest }) => rest);
    const inserted = await insertChunked("tbl_children", toInsert, "id, dob, gender, barangay");
    // Re-attach the in-memory profile/scenario fields to each inserted row by
    // position — insert() preserves array order, so this pairing is safe.
    inserted.forEach((row, i) => {
      row._profile = drafts[i]._profile;
      row._forceCurrentMonthDraft = drafts[i]._forceCurrentMonthDraft;
      row._skipThisMonth = drafts[i]._skipThisMonth;
    });
    allInsertedChildren.push(...inserted);
    process.stdout.write(`  ${b.name} [${scenario}]: ${n} children\r`);
  }
  console.log(`\n  total children inserted: ${allInsertedChildren.length}\n`);

  console.log("Generating assessments...");
  let assessmentRows = [];
  for (const child of allInsertedChildren) {
    assessmentRows.push(...buildAssessmentsForChild(child));
  }
  await insertChunked("tbl_assessments", assessmentRows);
  console.log(`  total assessments inserted: ${assessmentRows.length}\n`);

  console.log("Generating supplement records...");
  let supplementRows = [];
  for (const child of allInsertedChildren) {
    supplementRows.push(...buildSupplementsForChild(child));
  }
  await insertChunked("tbl_supplements", supplementRows);
  console.log(`  total supplement records inserted: ${supplementRows.length}\n`);

  console.log("Creating BNS accounts for barangays without one...");
  const passwordHash = await bcrypt.hash(BNS_PASSWORD, 10);
  const usedEmails = new Set(existingUsers.map((u) => u.email));
  const newAccounts = [];
  for (const b of barangays) {
    if (alreadyAssigned.has(b.name)) continue;
    let email = `bns.${slugify(b.name)}@weightogo.gov.ph`;
    if (usedEmails.has(email)) email = `bns.${slugify(b.name)}.${randInt(100, 999)}@weightogo.gov.ph`;
    usedEmails.add(email);
    newAccounts.push({
      email,
      password: passwordHash,
      role: "BNS",
      assigned_barangay: b.name,
      status: "active",
    });
  }
  if (newAccounts.length) {
    await insertChunked(
      "tbl_users",
      newAccounts.map(({ email, password, role, assigned_barangay, status }) => ({ email, password, role, assigned_barangay, status })),
      "id"
    );
  }
  console.log(`  created ${newAccounts.length} new BNS account(s). ${alreadyAssigned.size} barangay(s) already had one and were left untouched.\n`);

  console.log("=== Done ===\n");
  console.log("Barangay Map severity scenario assignment (check these on the map):");
  for (const scenario of SEVERITY_SCENARIOS) {
    const names = Object.entries(scenarioByBarangay)
      .filter(([, s]) => s === scenario)
      .map(([name]) => name);
    console.log(`  ${scenario}: ${names.join(", ")}`);
  }
  console.log("");

  console.log(`Shared password for every newly created BNS account: ${BNS_PASSWORD}\n`);
  console.log("barangay,email,password");
  for (const acc of newAccounts) {
    console.log(`${acc.assigned_barangay},${acc.email},${BNS_PASSWORD}`);
  }
}

main().catch((err) => {
  console.error("\nSeed script failed:", err.message);
  process.exit(1);
});
