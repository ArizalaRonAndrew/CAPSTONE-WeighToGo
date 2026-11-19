require("dotenv").config();

// Resets every barangay EXCEPT Tanggoy and repopulates it with 90-110 children,
// monthly 2026 assessments (Jan-Mar is one Q1 checkup) and supplement logs.
//
// Safety:
//   * tbl_users is never read for writes or modified in any way.
//   * Tanggoy is hard-excluded from the target list, the delete and the insert.
//   * Deletes are scoped to child ids that belong to target barangays.
//
// Barangay Map calibration:
//   The map's overall severity is the WORST of underweight/stunting/wasting/
//   overweight prevalence. Underweight has no "very low" band in the WHO/
//   UNICEF 1995 scale (0% still classifies as "low"), so a barangay with any
//   assessed children can never render overall "Very Low" - the floor is
//   "Low". This script therefore targets Very High / High / Medium / Low.
//
// Usage:
//   node scripts/seedAllOtherBarangays.js --dry-run   (default: preview only)
//   node scripts/seedAllOtherBarangays.js --apply     (writes to Supabase)

const supabase = require("../src/config/supabase");
const barangays = require("../src/data/barangays.json");
const { weightForAgeZ, heightForAgeZ } = require("../src/services/growthReference");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const { calculateAgeInMonths, todayInManila, addMonths, periodKeyForMonth } = require("../src/utils/date");
const { WEIGHT_RANGE, HEIGHT_RANGE } = require("../src/utils/measurements");
const { getScheduleWindows } = require("../src/services/supplementSchedule.service");
const {
  classifyUnderweight,
  classifyStunting,
  classifyWasting,
  classifyOverweight,
  worstTier,
} = require("../src/utils/publicHealthSignificance");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const EXCLUDED_BARANGAY = "Tanggoy";
const YEAR = 2026;
const CHUNK_SIZE = 200;
const MAX_AGE_MONTHS = 60;
const CHILDREN_MIN = 90;
const CHILDREN_MAX = 110;
const CURRENT_MONTH = todayInManila().slice(0, 7);

const MALNOURISHED_WFA = new Set(["Underweight", "Severely Underweight"]);
const STUNTED_HFA = new Set(["Stunted", "Severely Stunted"]);
const WASTED_WFL_H = new Set(["Wasted", "Severely Wasted"]);
const OVERWEIGHT_WFL_H = new Set(["Overweight", "Obese"]);

// ---------- deterministic RNG ----------
function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function randChoice(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function gaussian(rng, mean = 0, sd = 1) {
  const u1 = rng() || 1e-9;
  const u2 = rng();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
}
function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function clampInt(x, lo, hi) {
  return Math.min(Math.max(Math.round(x), lo), hi);
}

// ---------- name pools ----------
const BOY_NAMES = [
  "Juan", "Jose", "Miguel", "Gabriel", "Rafael", "Antonio", "Marco", "Angelo",
  "Carlo", "Daniel", "Emmanuel", "Francis", "Gerald", "Ivan", "Jacob", "Joshua",
  "Kian", "Leo", "Mark", "Nathan", "Paolo", "Renz", "Samuel", "Timothy",
  "Vince", "Xander", "Zack", "Elijah", "Aldrin", "Bryan", "Christian", "Dominic",
  "Enzo", "Frederick", "Gio", "Harold", "Ian", "Jayson", "Kyle", "Lorenzo",
];
const GIRL_NAMES = [
  "Maria", "Ana", "Sofia", "Isabel", "Angel", "Bea", "Carmela", "Diana",
  "Ella", "Faith", "Grace", "Hannah", "Ivy", "Joy", "Kate", "Liza",
  "Mikaela", "Nicole", "Olivia", "Precious", "Queenie", "Rica", "Samantha", "Trisha",
  "Vera", "Wynona", "Ysabel", "Zoe", "Alyssa", "Bianca", "Charlene", "Denise",
  "Erika", "Francine", "Gwyneth", "Honey", "Irish", "Janna", "Kristine", "Lorraine",
];
const SURNAMES = [
  "Reyes", "Santos", "Cruz", "Bautista", "Ocampo", "Garcia", "Torres", "Ramos",
  "Villanueva", "Mendoza", "Castillo", "Aquino", "Del Rosario", "Salazar", "Navarro",
  "Pascual", "Gonzales", "Marquez", "Fernandez", "Domingo", "Rivera", "De Leon",
  "Aguilar", "Ilagan", "Malabanan", "Mercado", "Panganiban", "Umali", "Manalo",
  "Bernardo", "Concepcion", "Dizon", "Espiritu", "Flores", "Gutierrez", "Herrera",
  "Isip", "Javier", "Katigbak", "Lopez", "Macaraeg", "Nolasco", "Ople",
];
const MOTHER_NAMES = [
  "Maria", "Ana", "Rosa", "Liza", "Cristina", "Josefina", "Marilou", "Editha",
  "Rowena", "Beverly", "Catherine", "Divina", "Elena", "Flordeliza", "Gemma",
  "Imelda", "Jenny", "Kristine", "Lorna", "Marissa", "Nelia", "Ofelia", "Perlita",
  "Rebecca", "Salome", "Teresita", "Vilma", "Yolanda", "Zenaida", "Arlene",
];
const FATHER_NAMES = [
  "Jose", "Juan", "Pedro", "Ramon", "Ricardo", "Roberto", "Eduardo", "Fernando",
  "Alfredo", "Benigno", "Carlos", "Dante", "Ernesto", "Fidel", "Gregorio",
  "Hector", "Ignacio", "Jaime", "Leandro", "Manuel", "Nestor", "Orlando",
  "Pablo", "Rogelio", "Salvador", "Tomas", "Ulysses", "Victor", "Wilfredo", "Zacarias",
];
const PHONE_PREFIXES = [
  "0917", "0918", "0919", "0920", "0921", "0927", "0928", "0929", "0930", "0935",
  "0936", "0938", "0939", "0945", "0946", "0947", "0948", "0949", "0950", "0951",
  "0956", "0961", "0963", "0966", "0967", "0970", "0975", "0976", "0977", "0978",
  "0979", "0985", "0989", "0994", "0995", "0996", "0997", "0998", "0999",
];
const PUROKS = [
  "Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5", "Purok 6", "Purok 7",
  "Sitio Ilog", "Sitio Bukid", "Sitio Maligaya",
];

// ---------- growth helpers ----------
function inverseZ(zFn, targetZ, lo, hi, iterations = 40) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (zFn(mid) < targetZ) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
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
  return {
    weight: round1(clamp(weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max)),
    height: round1(clamp(height, HEIGHT_RANGE.min, HEIGHT_RANGE.max)),
  };
}

function classifyMeas(gender, ageInMonths, weight, height) {
  return classifyNutritionStatus({ sex: gender, ageInMonths, weightKg: weight, heightCm: height });
}

function statusesForZ(gender, ageInMonths, zW, zH) {
  const m = measurementsForZ(gender, ageInMonths, zW, zH);
  return { ...m, ...classifyMeas(gender, ageInMonths, m.weight, m.height) };
}

function isAllNormal(statuses) {
  return (
    statuses.wfa_status === "Normal" &&
    statuses.hfa_status === "Normal" &&
    statuses.wfl_h_status === "Normal"
  );
}

function targetKey(target) {
  if (!target) return "normal";
  return `${target.wfa_status}|${target.hfa_status}|${target.wfl_h_status}`;
}

function matchesTarget(statuses, target) {
  if (!target) return isAllNormal(statuses);
  // A heavy child can also read Overweight/Obese on weight-for-age. That is
  // harmless for the map (only Underweight/Severely Underweight count), so
  // overweight profiles only require a normal height and a non-underweight
  // weight-for-age, which makes the planned WFL target reachable at any height.
  if (target.wfl_h_status === "Overweight" || target.wfl_h_status === "Obese") {
    return (
      statuses.wfl_h_status === target.wfl_h_status &&
      statuses.hfa_status === "Normal" &&
      statuses.wfa_status !== "Underweight" &&
      statuses.wfa_status !== "Severely Underweight"
    );
  }
  return (
    statuses.wfa_status === target.wfa_status &&
    statuses.hfa_status === target.hfa_status &&
    statuses.wfl_h_status === target.wfl_h_status
  );
}

// Precomputed medians make the ordinary-child fast path cheap.
const MEDIAN_WEIGHT = { Male: [], Female: [] };
const MEDIAN_HEIGHT = { Male: [], Female: [] };
for (const gender of ["Male", "Female"]) {
  for (let age = 0; age <= MAX_AGE_MONTHS; age++) {
    MEDIAN_WEIGHT[gender][age] = inverseZ(
      (x) => weightForAgeZ(gender, age, x),
      0,
      WEIGHT_RANGE.min,
      WEIGHT_RANGE.max
    );
    MEDIAN_HEIGHT[gender][age] = inverseZ(
      (x) => heightForAgeZ(gender, age, x),
      0,
      HEIGHT_RANGE.min,
      HEIGHT_RANGE.max
    );
  }
}

function medianWeight(gender, age) {
  return MEDIAN_WEIGHT[gender][clamp(age, 0, MAX_AGE_MONTHS)];
}
function medianHeight(gender, age) {
  return MEDIAN_HEIGHT[gender][clamp(age, 0, MAX_AGE_MONTHS)];
}

function monthsBetween(fromDate, toDate) {
  const [fy, fm] = fromDate.split("-").map(Number);
  const [ty, tm] = toDate.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm));
}

function daysInMonth(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Per-month growth caps for a plausible checkup-to-checkup path.
function monthlyGrowthCaps(ageInMonths) {
  if (ageInMonths < 3) return { weight: 1.5, height: 5.0 };
  if (ageInMonths < 12) return { weight: 1.3, height: 3.0 };
  if (ageInMonths < 36) return { weight: 1.2, height: 2.0 };
  return { weight: 1.0, height: 1.2 };
}

// Ordinary profiles share one base z for weight and height, which keeps
// weight-for-height near the median (independent draws can drift into
// wasting/overweight). Validated against the real classifier at probe ages.
const NORMAL_PROBE_AGES = [0, 3, 6, 12, 24, 36, 48, 60];
function buildNormalProfile(gender, rng, bias = 0) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const base = clamp(gaussian(rng, bias, 0.25), -1.3, 1.3);
    const zW = clamp(base + gaussian(rng, 0, 0.08), -1.5, 1.5);
    const zH = clamp(base + gaussian(rng, 0, 0.08), -1.5, 1.5);
    const ok = NORMAL_PROBE_AGES.every((age) => isAllNormal(statusesForZ(gender, age, zW, zH)));
    if (ok) return { zW, zH };
  }
  return { zW: 0, zH: 0 };
}

// Case children start from a normal profile biased toward their eventual
// issue, so an incident/recovery step is a small, plausible change instead of
// a 3-4 kg jump in a single month.
function profileBiasFor(profileType) {
  if (profileType === "wasted_only" || profileType === "underweight_wasted") return -1.0;
  if (profileType === "overweight_only") return 1.0;
  if (profileType === "stunted_underweight") return -0.6;
  return 0;
}

// ---------- case profiles ----------
// Each profile is a complete three-column target: only the named indicator is
// abnormal and the other two stay Normal. The probe run confirmed every
// combination is reachable from age 2 through 59 months.
const PROFILE_TARGETS = {
  stunted_underweight: {
    moderate: { wfa_status: "Underweight", hfa_status: "Stunted", wfl_h_status: "Normal" },
    severe: { wfa_status: "Severely Underweight", hfa_status: "Severely Stunted", wfl_h_status: "Normal" },
  },
  wasted_only: {
    moderate: { wfa_status: "Normal", hfa_status: "Normal", wfl_h_status: "Wasted" },
    severe: { wfa_status: "Normal", hfa_status: "Normal", wfl_h_status: "Severely Wasted" },
  },
  overweight_only: {
    moderate: { wfa_status: "Normal", hfa_status: "Normal", wfl_h_status: "Overweight" },
    severe: { wfa_status: "Normal", hfa_status: "Normal", wfl_h_status: "Obese" },
  },
  underweight_wasted: {
    moderate: { wfa_status: "Underweight", hfa_status: "Normal", wfl_h_status: "Wasted" },
    severe: { wfa_status: "Severely Underweight", hfa_status: "Normal", wfl_h_status: "Severely Wasted" },
  },
};

const casePairCache = new Map();
const normalPairCache = new Map();

function findNormalZPair(gender, age) {
  const key = `${gender}|${age}`;
  if (normalPairCache.has(key)) return normalPairCache.get(key);
  let best = null;
  let bestScore = Infinity;
  for (let zw = -1.8; zw <= 1.81; zw += 0.2) {
    for (let zh = -1.8; zh <= 1.81; zh += 0.2) {
      const s = statusesForZ(gender, age, zw, zh);
      if (!isAllNormal(s)) continue;
      const score = Math.abs(zw) + Math.abs(zh);
      if (score < bestScore) {
        bestScore = score;
        best = { zW: zw, zH: zh };
      }
    }
  }
  normalPairCache.set(key, best || { zW: 0, zH: 0 });
  return best || { zW: 0, zH: 0 };
}

// Coarse grid + local refinement keeps the one-time cache build affordable
// while still returning a z-pair whose rounded measurements re-classify
// exactly to the requested target.
function findCaseZPair(gender, age, target) {
  const key = `${gender}|${age}|${targetKey(target)}`;
  if (casePairCache.has(key)) return casePairCache.get(key);

  let best = null;
  let bestScore = Infinity;
  for (let zw = -4; zw <= 4.001; zw += 0.4) {
    for (let zh = -4; zh <= 4.001; zh += 0.4) {
      const s = statusesForZ(gender, age, zw, zh);
      if (!matchesTarget(s, target)) continue;
      const score = Math.abs(zw) + Math.abs(zh);
      if (score < bestScore) {
        bestScore = score;
        best = { zW: zw, zH: zh };
      }
    }
  }
  if (best) {
    let refined = best;
    let refinedScore = bestScore;
    for (let zw = best.zW - 0.3; zw <= best.zW + 0.31; zw += 0.1) {
      for (let zh = best.zH - 0.3; zh <= best.zH + 0.31; zh += 0.1) {
        const s = statusesForZ(gender, age, zw, zh);
        if (!matchesTarget(s, target)) continue;
        const score = Math.abs(zw) + Math.abs(zh);
        if (score < refinedScore) {
          refinedScore = score;
          refined = { zW: zw, zH: zh };
        }
      }
    }
    best = refined;
  }
  casePairCache.set(key, best);
  return best;
}

// ---------- historical trajectories ----------
// Chronic stunting is slow-moving: children stay stunted all year but can move
// between Stunted and Severely Stunted. Wasting/overweight/underweight profiles
// use incident/relapse/recovered arcs, which are physically reachable month to
// month via weight change. A recovered child is abnormal early in the year and
// Normal by November, so they add trend movement without inflating the map's
// current-month case count.
function choosePattern(rng, mix, transient) {
  if (transient) return "recovered";
  if (mix === "chronic") return "persistent";
  // No mid-year "incident" here: an incident starting in April can exactly
  // cancel out a recovered child, leaving a flat monthly count. Relapse plus
  // the guaranteed recovered cases below always produce real movement.
  return randChoice(rng, ["persistent", "persistent", "relapse"]);
}

function buildCasePlan(profileType, pattern, len, rng) {
  const variants = PROFILE_TARGETS[profileType];
  const targets = Array(len).fill(null);

  if (pattern === "recovered") {
    const end = len <= 1 ? 0 : randInt(rng, 1, len - 1);
    for (let i = 0; i < end; i++) targets[i] = variants.moderate;
    return targets;
  }

  if (pattern === "improving" || pattern === "worsening") {
    // Chronic stunting is kept moderate all year: moving between Stunted and
    // Severely Stunted month to month is not physically reachable once height
    // is already fixed, and would create impossible measurement jumps.
    for (let i = 0; i < len; i++) targets[i] = variants.moderate;
    return targets;
  }

  if (pattern === "persistent") {
    // One variant for the whole year, chosen at the first checkup. A mid-year
    // switch from moderate to severe is not always reachable in one month.
    const variant =
      profileType !== "stunted_underweight" && rng() < 0.15 ? variants.severe : variants.moderate;
    for (let i = 0; i < len; i++) targets[i] = variant;
    return targets;
  }

  if (pattern === "incident") {
    if (len === 1) {
      targets[0] = variants.moderate;
      return targets;
    }
    const start = randInt(rng, 1, Math.max(1, len - 2));
    for (let i = start; i < len; i++) targets[i] = variants.moderate;
    return targets;
  }

  if (pattern === "relapse") {
    if (len < 3) {
      targets[0] = variants.moderate;
      if (len > 1) targets[len - 1] = variants.moderate;
      return targets;
    }
    const firstEnd = randInt(rng, 1, Math.max(1, len - 3));
    const secondStart = randInt(rng, firstEnd + 1, Math.max(firstEnd + 1, len - 2));
    for (let i = 0; i < firstEnd; i++) targets[i] = variants.moderate;
    for (let i = secondStart; i < len; i++) targets[i] = variants.moderate;
    return targets;
  }

  // Fallback: persistent moderate.
  for (let i = 0; i < len; i++) targets[i] = variants.moderate;
  return targets;
}

// ---------- barangay-level calibration ----------
// The case plan is expressed as groups of children sharing a profile type.
// expectedCountsFromPlan() turns those groups into the exact indicator counts
// that the map will see in the current month, so the plan can be validated
// before a single row is generated.
function buildBarangayPlan(severity, childCount, rng) {
  const groups = [];
  const add = (profileType, count, mix) => {
    if (count > 0) groups.push({ profileType, count, mix });
  };

  if (severity === "very-high") {
    const driver = randChoice(rng, ["wasted_only", "overweight_only"]);
    const min = Math.ceil(childCount * 0.155);
    const count = clampInt(childCount * (0.16 + rng() * 0.03), min, 20);
    add(driver, count, "dynamic");
  } else if (severity === "high") {
    const driver = randChoice(rng, ["wasted_only", "overweight_only"]);
    const min = Math.ceil(childCount * 0.1);
    const max = Math.ceil(childCount * 0.15) - 1;
    const count = clampInt(childCount * (0.11 + rng() * 0.03), min, max);
    add(driver, count, "dynamic");
    const extra = Math.min(randInt(rng, 0, 3), 20 - count);
    if (extra > 0) add("stunted_underweight", extra, "chronic");
  } else if (severity === "medium") {
    const mode = randChoice(rng, ["stunting", "wasting", "overweight", "mixed"]);
    if (mode === "stunting") {
      const min = Math.ceil(childCount * 0.1);
      const max = Math.min(20, Math.ceil(childCount * 0.19));
      const count = clampInt(childCount * (0.12 + rng() * 0.05), min, max);
      add("stunted_underweight", count, "chronic");
    } else if (mode === "wasting") {
      const min = Math.ceil(childCount * 0.05);
      const max = Math.ceil(childCount * 0.1) - 1;
      const count = clampInt(childCount * (0.06 + rng() * 0.03), min, max);
      add("wasted_only", count, "dynamic");
    } else if (mode === "overweight") {
      const min = Math.ceil(childCount * 0.05);
      const max = Math.ceil(childCount * 0.1) - 1;
      const count = clampInt(childCount * (0.06 + rng() * 0.03), min, max);
      add("overweight_only", count, "dynamic");
    } else {
      const stuntCount = clampInt(childCount * (0.05 + rng() * 0.03), 5, Math.ceil(childCount * 0.09));
      add("stunted_underweight", stuntCount, "chronic");
      const wasteMin = Math.ceil(childCount * 0.05);
      const wasteMax = Math.min(Math.ceil(childCount * 0.09), 20 - stuntCount);
      const wasteCount = clampInt(childCount * (0.06 + rng() * 0.03), wasteMin, wasteMax);
      add(randChoice(rng, ["wasted_only", "overweight_only"]), wasteCount, "dynamic");
    }
  } else {
    // Low: 5-9 stunted+underweight children are all "low" (under 10%), then a
    // few wasting/overweight children kept below their 5% medium cutoff.
    const stuntMax = Math.max(5, Math.ceil(childCount * 0.1) - 1);
    const stuntCount = clampInt(childCount * (0.06 + rng() * 0.03), 5, stuntMax);
    add("stunted_underweight", stuntCount, "chronic");
    const wasteMax = Math.max(0, Math.ceil(childCount * 0.05) - 1);
    const wasteCount = randInt(rng, 0, Math.min(3, wasteMax, 20 - stuntCount));
    // Use wasted-only (not underweight+wasted) so the optional cases do not
    // push the underweight rate over its 10% low/medium boundary.
    if (wasteCount > 0) add("wasted_only", wasteCount, "dynamic");
    const overMax = Math.max(0, Math.ceil(childCount * 0.05) - 1);
    const overCount = randInt(rng, 0, Math.min(2, overMax, 20 - stuntCount - wasteCount));
    if (overCount > 0) add("overweight_only", overCount, "dynamic");
  }

  const novCases = groups.reduce((sum, g) => sum + g.count, 0);
  // At least one recovered case per barangay: those children are abnormal
  // early in the year and Normal by November, so they add real movement to the
  // trend lines without changing the current-month map counts.
  const transientCount = novCases < 20 ? randInt(rng, 1, Math.min(3, 20 - novCases)) : 0;
  return { severity, groups, transientCount };
}

function expectedCountsFromPlan(plan) {
  const counts = { underweight: 0, stunted: 0, wasted: 0, overweight: 0 };
  for (const g of plan.groups) {
    if (g.profileType === "stunted_underweight") {
      counts.underweight += g.count;
      counts.stunted += g.count;
    } else if (g.profileType === "wasted_only") {
      counts.wasted += g.count;
    } else if (g.profileType === "overweight_only") {
      counts.overweight += g.count;
    } else if (g.profileType === "underweight_wasted") {
      counts.underweight += g.count;
      counts.wasted += g.count;
    }
  }
  return counts;
}

// 1 Very High, 3 High, then roughly half Medium / half Low (43 remaining).
function buildSeverityAssignment(names, rng) {
  const shuffled = shuffle(rng, [...names]);
  const assignment = new Map();
  assignment.set(shuffled[0], "very-high");
  for (let i = 1; i <= 3; i++) assignment.set(shuffled[i], "high");
  const remaining = shuffled.slice(4);
  const mediumTarget = Math.round(remaining.length * 0.49);
  remaining.forEach((name, i) => {
    assignment.set(name, i < mediumTarget ? "medium" : "low");
  });
  return assignment;
}

// ---------- child drafts ----------
function phContact(rng) {
  const prefix = randChoice(rng, PHONE_PREFIXES);
  let digits = "";
  for (let i = 0; i < 7; i++) digits += randInt(rng, 0, 9);
  return `${prefix}${digits}`;
}

function makeUniqueName(rng, gender, used) {
  const pool = gender === "Male" ? BOY_NAMES : GIRL_NAMES;
  for (let attempt = 0; attempt < 300; attempt++) {
    const name = `${randChoice(rng, pool)} ${randChoice(rng, SURNAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Extremely unlikely fallback: add a middle initial.
  for (let attempt = 0; attempt < 500; attempt++) {
    const middle = String.fromCharCode(65 + randInt(rng, 0, 25));
    const name = `${randChoice(rng, pool)} ${middle}. ${randChoice(rng, SURNAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  throw new Error("Could not generate a unique child name");
}

function buildChildDraft({ barangay, caseSpec, rng, today, usedNames }) {
  const gender = rng() < 0.5 ? "Male" : "Female";
  const name = makeUniqueName(rng, gender, usedNames);
  const surname = name.split(" ").pop();

  let currentAge = randInt(rng, 0, 59);
  // Case children start at 13+ months so every 2026 checkup (including the
  // first period) is old enough for all planned indicator combinations.
  if (caseSpec && currentAge < 13) currentAge = randInt(rng, 13, 30);
  // A recovered child needs at least two periods to show a recovery arc.
  if (caseSpec && caseSpec.pattern === "recovered" && currentAge < 1) {
    currentAge = randInt(rng, 1, 3);
  }
  const todayDay = Number(today.slice(8, 10));
  const dobMonth = addMonths(today.slice(0, 7), -currentAge);
  let dobDay = currentAge === 0 ? randInt(rng, 1, Math.max(1, Math.min(15, todayDay - 1))) : randInt(rng, 1, 28);
  dobDay = Math.min(dobDay, daysInMonth(dobMonth));
  let dob = `${dobMonth}-${String(dobDay).padStart(2, "0")}`;
  if (dob > today) dob = `${dobMonth}-${String(Math.max(1, todayDay - 1)).padStart(2, "0")}`;

  const normalProfile = buildNormalProfile(gender, rng, caseSpec ? profileBiasFor(caseSpec.profileType) : 0);
  const periods = assessmentPeriodsForChild(dob, today);
  let casePlan = null;
  if (caseSpec) {
    const targets = buildCasePlan(caseSpec.profileType, caseSpec.pattern, periods.length, rng);
    casePlan = {
      profileType: caseSpec.profileType,
      pattern: caseSpec.pattern,
      targetsByPeriod: new Map(periods.map((p, i) => [p, targets[i]])),
      isTransient: caseSpec.pattern === "recovered",
    };
  }

  const parentFirst = randChoice(rng, rng() < 0.5 ? MOTHER_NAMES : FATHER_NAMES);
  const parentSurname = rng() < 0.7 ? surname : randChoice(rng, SURNAMES);

  return {
    _tempId: `tmp-${barangay}-${usedNames.size}`,
    name,
    dob,
    gender,
    barangay,
    purok: randChoice(rng, PUROKS),
    parent_name: `${parentFirst} ${parentSurname}`,
    parent_contact: rng() < 0.95 ? phContact(rng) : null,
    is_ip: rng() < 0.06,
    status: "active",
    _normalProfile: normalProfile,
    _casePlan: casePlan,
    _periods: periods,
  };
}

// Jan-Mar is one Q1 assessment window; every later month is its own period.
function assessmentPeriodsForChild(dob, today) {
  const startMonth = dob.slice(0, 7) > `${YEAR}-01` ? dob.slice(0, 7) : `${YEAR}-01`;
  const endMonth = today.slice(0, 7);
  const seen = new Set();
  const out = [];
  let month = startMonth;
  while (month <= endMonth) {
    const period = periodKeyForMonth(month);
    if (!seen.has(period)) {
      seen.add(period);
      out.push(period);
    }
    month = addMonths(month, 1);
  }
  return out;
}

function assessmentDatesForChild(dob, today) {
  const periods = assessmentPeriodsForChild(dob, today);
  const dobMonth = dob.slice(0, 7);
  const dobDay = Number(dob.slice(8, 10));
  const todayMonth = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));

  return periods.map((period) => {
    if (period.endsWith("-Q1")) {
      const q1Months = [`${YEAR}-01`, `${YEAR}-02`, `${YEAR}-03`];
      const eligible = q1Months.filter((m) => m >= dobMonth);
      const month = eligible[hashString(`${dob}|${period}`) % eligible.length];
      let day = 10 + (hashString(`${dob}|${period}`) % 5);
      if (month === dobMonth) day = Math.max(day, dobDay);
      day = clamp(day, 1, daysInMonth(month));
      return `${month}-${String(day).padStart(2, "0")}`;
    }

    const month = period;
    let day = 5 + (hashString(`${dob}|${month}`) % 6);
    if (month === dobMonth) day = Math.max(day, dobDay);
    if (month === todayMonth) day = Math.min(day, todayDay);
    day = clamp(day, 1, daysInMonth(month));
    let date = `${month}-${String(day).padStart(2, "0")}`;
    if (date < dob) {
      day = clamp(dobDay, 1, daysInMonth(month));
      date = `${month}-${String(day).padStart(2, "0")}`;
    }
    if (date > today) date = today;
    return date;
  });
}

function buildSupplementRows(child, today) {
  const dobMonth = child.dob.slice(0, 7);
  const currentAge = Math.min(calculateAgeInMonths(child.dob, today), 59);
  const rows = [];
  for (const supplementType of ["Vitamin A", "Deworming"]) {
    for (const w of getScheduleWindows(supplementType)) {
      if (w.start_month > currentAge) break;
      if (hashString(`${child.barangay}|${child.name}|${supplementType}|${w.dose_order}`) % 100 < 15) continue;
      const date = `${addMonths(dobMonth, w.start_month)}-10`;
      if (date > today) continue;
      rows.push({
        child_id: child._tempId,
        supplement_type: supplementType,
        dose_order: w.dose_order,
        age_in_months: calculateAgeInMonths(child.dob, date),
        date_administered: date,
        status: "active",
      });
    }
  }
  return rows;
}

// ---------- measurement generation ----------
function normalFirstRow(child, age, rng) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const base = child._normalProfile;
    const zW = base.zW + gaussian(rng, 0, 0.06);
    const zH = base.zH + gaussian(rng, 0, 0.06);
    const m = measurementsForZ(child.gender, age, zW, zH);
    const s = classifyMeas(child.gender, age, m.weight, m.height);
    if (isAllNormal(s)) return { ...m, statuses: s };
  }
  const base = findNormalZPair(child.gender, age);
  const m = measurementsForZ(child.gender, age, base.zW, base.zH);
  const s = classifyMeas(child.gender, age, m.weight, m.height);
  return isAllNormal(s) ? { ...m, statuses: s } : null;
}

function normalNextRow(child, age, prev, elapsed, rng) {
  const gender = child.gender;
  const caps = monthlyGrowthCaps(age);
  const prevAge = Math.max(0, age - elapsed);
  const expectedW = prev.weight + (medianWeight(gender, age) - medianWeight(gender, prevAge));
  const expectedH = prev.height + (medianHeight(gender, age) - medianHeight(gender, prevAge));

  for (let attempt = 0; attempt < 80; attempt++) {
    const spread = 0.05 + attempt * 0.01;
    const zW = child._normalProfile.zW + gaussian(rng, 0, spread);
    const zH = child._normalProfile.zH + gaussian(rng, 0, spread);
    const m = measurementsForZ(gender, age, zW, zH);

    // Children never get shorter; weight stays on a sane growth path.
    let weight = round1(Math.max(prev.weight, m.weight));
    let height = round1(Math.max(prev.height, m.height));
    weight = clamp(weight, prev.weight - 0.2 * elapsed, prev.weight + caps.weight * elapsed * 1.5);
    height = clamp(height, prev.height, prev.height + caps.height * elapsed * 1.5);
    weight = round1(weight);
    height = round1(height);

    const s = classifyMeas(gender, age, weight, height);
    if (isAllNormal(s)) return { weight, height, statuses: s };
  }

  const fallback = searchMeasurementRow(child, age, null, prev, elapsed, rng, expectedW, expectedH);
  return fallback;
}

function caseFirstRow(child, age, target, rng) {
  const base = findCaseZPair(child.gender, age, target);
  if (!base) return null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const zW = base.zW + gaussian(rng, 0, 0.06);
    const zH = base.zH + gaussian(rng, 0, 0.06);
    const m = measurementsForZ(child.gender, age, zW, zH);
    const s = classifyMeas(child.gender, age, m.weight, m.height);
    if (matchesTarget(s, target)) return { ...m, statuses: s };
  }
  const m = measurementsForZ(child.gender, age, base.zW, base.zH);
  const s = classifyMeas(child.gender, age, m.weight, m.height);
  return matchesTarget(s, target) ? { ...m, statuses: s } : null;
}

// Searches real weight/height pairs inside a plausible envelope around the
// previous checkup. Candidates are actual measurements, so the stored status
// can never disagree with the stored weight/height.
function searchMeasurementRow(child, age, target, prev, elapsed, rng, expectedWOverride, expectedHOverride) {
  const gender = child.gender;
  const caps = monthlyGrowthCaps(age);
  const maxGainW = caps.weight * elapsed;
  const maxGainH = caps.height * elapsed;
  const maxLossW = 0.8 * elapsed;
  const prevAge = Math.max(0, age - elapsed);

  const expectedW =
    expectedWOverride !== undefined
      ? expectedWOverride
      : prev.weight + (medianWeight(gender, age) - medianWeight(gender, prevAge));
  const expectedH =
    expectedHOverride !== undefined
      ? expectedHOverride
      : prev.height + (medianHeight(gender, age) - medianHeight(gender, prevAge));

  for (const relax of [1, 1.5, 2.2, 3.2]) {
    const wLo = Math.max(WEIGHT_RANGE.min, prev.weight - maxLossW * relax);
    const wHi = Math.min(WEIGHT_RANGE.max, prev.weight + maxGainW * relax);
    const hLo = prev.height;
    const hHi = Math.min(HEIGHT_RANGE.max, prev.height + maxGainH * relax);

    let best = null;
    let bestScore = Infinity;
    const startW = Math.ceil(wLo * 10) / 10;
    const startH = Math.ceil(hLo * 10) / 10;
    for (let w = startW; w <= wHi + 0.05; w += 0.1) {
      const weight = round1(clamp(w, WEIGHT_RANGE.min, WEIGHT_RANGE.max));
      for (let h = startH; h <= hHi + 0.05; h += 0.1) {
        const height = round1(clamp(h, HEIGHT_RANGE.min, HEIGHT_RANGE.max));
        const s = classifyMeas(gender, age, weight, height);
        if (!matchesTarget(s, target)) continue;

        let score = Math.abs(weight - expectedW) + 1.2 * Math.abs(height - expectedH);
        score += Math.max(0, prev.weight - weight) * 2.5;
        score += rng() * 1e-6;
        if (target) {
          const extra = ["wfa_status", "hfa_status", "wfl_h_status"].filter(
            (col) => target[col] === "Normal" && s[col] !== "Normal"
          ).length;
          score += extra * 0.6;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { weight, height, statuses: s };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function buildAssessmentRow(child, date, age, target, rng) {
  let picked;
  if (!child._lastM) {
    picked = target ? caseFirstRow(child, age, target, rng) : normalFirstRow(child, age, rng);
  } else {
    const elapsed = monthsBetween(child._lastDate, date);
    picked = target
      ? searchMeasurementRow(child, age, target, child._lastM, elapsed, rng)
      : normalNextRow(child, age, child._lastM, elapsed, rng);
  }

  if (!picked) return null;
  child._lastM = { weight: picked.weight, height: picked.height };
  child._lastDate = date;
  return picked;
}

// ---------- plan assembly ----------
function buildCaseSpecs(plan, rng) {
  const specs = [];
  for (const group of plan.groups) {
    for (let i = 0; i < group.count; i++) {
      specs.push({ profileType: group.profileType, pattern: choosePattern(rng, group.mix, false) });
    }
  }
  const transientProfiles = ["wasted_only", "overweight_only"];
  for (let i = 0; i < plan.transientCount; i++) {
    specs.push({ profileType: randChoice(rng, transientProfiles), pattern: "recovered" });
  }
  return shuffle(rng, specs);
}

function buildAllPlans(targetBarangays, today) {
  const assignmentRng = makeRng(hashString("severity-assignment|v3"));
  const assignment = buildSeverityAssignment(targetBarangays, assignmentRng);
  const plans = [];

  for (const name of targetBarangays) {
    const rng = makeRng(hashString(`${name}|plan|v3`));
    const childCount = randInt(rng, CHILDREN_MIN, CHILDREN_MAX);
    const severity = assignment.get(name);
    const plan = buildBarangayPlan(severity, childCount, rng);
    const caseSpecs = buildCaseSpecs(plan, rng);
    const usedNames = new Set();
    const children = [];

    for (let i = 0; i < childCount; i++) {
      const caseSpec = i < caseSpecs.length ? caseSpecs[i] : null;
      children.push(buildChildDraft({ barangay: name, caseSpec, rng, today, usedNames }));
    }
    shuffle(rng, children);

    plans.push({ name, childCount, severity, plan, children });
  }
  return plans;
}

// ---------- row generation ----------
function generateRows(children, today) {
  const assessmentRows = [];
  const supplementRows = [];
  const childBarangayMap = new Map();
  const stats = { misfires: 0, targetMisses: 0, datePeriodMismatches: 0, misfireDetails: [] };


  const byBarangay = new Map();
  for (const child of children) {
    if (!byBarangay.has(child.barangay)) byBarangay.set(child.barangay, []);
    byBarangay.get(child.barangay).push(child);
  }

  for (const [barangay, barangayChildren] of byBarangay) {
    const rng = makeRng(hashString(`${barangay}|measure|v3`));
    for (const child of barangayChildren) {
      const work = { ...child, _lastM: null, _lastDate: null };
      childBarangayMap.set(child._tempId, barangay);
      const dates = assessmentDatesForChild(child.dob, today);
      if (dates.length !== child._periods.length) stats.datePeriodMismatches += 1;

      for (const date of dates) {
        const age = calculateAgeInMonths(child.dob, date);
        if (age > MAX_AGE_MONTHS) continue;
        const period = periodKeyForMonth(date.slice(0, 7));
        const target = child._casePlan ? child._casePlan.targetsByPeriod.get(period) || null : null;
        const built = buildAssessmentRow(work, date, age, target, rng);

        if (!built) {
          stats.misfires += 1;
          if (stats.misfireDetails.length < 40) {
            stats.misfireDetails.push({
              barangay,
              child: child.name,
              date,
              age,
              profile: child._casePlan ? child._casePlan.profileType : "normal",
              pattern: child._casePlan ? child._casePlan.pattern : "-",
              target: target ? targetKey(target) : "normal",
              first: !work._lastM,
              prev: work._lastM ? `${work._lastM.weight}kg/${work._lastM.height}cm` : null,
            });
          }
          continue;
        }
        if (target && !matchesTarget(built.statuses, target)) stats.targetMisses += 1;

        assessmentRows.push({
          child_id: child._tempId,
          date_measured: date,
          weight: built.weight,
          height: built.height,
          age_in_months: age,
          wfa_status: built.statuses.wfa_status,
          hfa_status: built.statuses.hfa_status,
          wfl_h_status: built.statuses.wfl_h_status,
          submission_status: "submitted",
          status: "active",
        });
      }

      supplementRows.push(...buildSupplementRows(work, today));
    }
  }

  return { assessmentRows, supplementRows, childBarangayMap, stats };
}

// ---------- map severity ----------
function severityFromCounts(counts, total) {
  if (!total) return "no-data";
  const pct = (n) => (n / total) * 100;
  return worstTier(
    classifyUnderweight(pct(counts.underweight)),
    classifyStunting(pct(counts.stunted)),
    classifyWasting(pct(counts.wasted)),
    classifyOverweight(pct(counts.overweight))
  );
}

function computeCurrentMonthSeverity(rows, childBarangayMap, barangayNames) {
  const stats = new Map();
  for (const name of barangayNames) {
    stats.set(name, { total: 0, underweight: 0, stunted: 0, wasted: 0, overweight: 0 });
  }

  for (const row of rows) {
    if (!row.date_measured.startsWith(CURRENT_MONTH)) continue;
    const barangay = childBarangayMap.get(row.child_id);
    const bucket = stats.get(barangay);
    if (!bucket) continue;
    bucket.total += 1;
    if (MALNOURISHED_WFA.has(row.wfa_status)) bucket.underweight += 1;
    if (STUNTED_HFA.has(row.hfa_status)) bucket.stunted += 1;
    if (WASTED_WFL_H.has(row.wfl_h_status)) bucket.wasted += 1;
    if (OVERWEIGHT_WFL_H.has(row.wfl_h_status)) bucket.overweight += 1;
  }

  const out = new Map();
  for (const [name, bucket] of stats) {
    out.set(name, {
      ...bucket,
      severity: severityFromCounts(bucket, bucket.total),
      underweightPct: bucket.total ? (bucket.underweight / bucket.total) * 100 : 0,
      stuntedPct: bucket.total ? (bucket.stunted / bucket.total) * 100 : 0,
      wastedPct: bucket.total ? (bucket.wasted / bucket.total) * 100 : 0,
      overweightPct: bucket.total ? (bucket.overweight / bucket.total) * 100 : 0,
    });
  }
  return out;
}

// ---------- database helpers ----------
async function fetchTargetChildren(targetBarangays) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tbl_children")
      .select("id, barangay, status")
      .in("barangay", targetBarangays)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Failed to fetch target children: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function countTable(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  return count || 0;
}

async function countByBarangay(barangay) {
  const { count, error } = await supabase
    .from("tbl_children")
    .select("id", { count: "exact", head: true })
    .eq("barangay", barangay);
  if (error) throw new Error(`Failed to count ${barangay} children: ${error.message}`);
  return count || 0;
}

async function countFor(table, column, ids) {
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, ids.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
    total += count || 0;
  }
  return total;
}

async function deleteForIds(table, column, ids) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from(table).delete().in(column, ids.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
  }
}

async function insertChunked(table, rows, selectCols) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.from(table).insert(chunk).select(selectCols || "id");
    if (error) throw new Error(`Failed to insert into ${table}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

function replaceChildIds(rows, idMap) {
  for (const row of rows) row.child_id = idMap.get(row.child_id) || row.child_id;
}

// ---------- reporting ----------
function pct(value) {
  return `${value.toFixed(1)}%`;
}

function printProjection(plans, projected) {
  console.log("\nProjected Barangay Map severity this month:");
  console.log("  barangay | children | cases | Uw% | St% | Wa% | Ow% | severity (plan)");
  const severityOrder = { "very-high": 0, high: 1, medium: 2, low: 3, "no-data": 4 };
  const sorted = [...plans].sort((a, b) => {
    const diff = severityOrder[projected.get(a.name).severity] - severityOrder[projected.get(b.name).severity];
    return diff || a.name.localeCompare(b.name);
  });
  for (const p of sorted) {
    const s = projected.get(p.name);
    const cases = p.plan.groups.reduce((n, g) => n + g.count, 0);
    const status = s.severity === p.severity ? s.severity : `${s.severity} != ${p.severity}`;
    console.log(
      `  ${p.name.padEnd(24)} | ${String(p.childCount).padStart(8)} | ${String(cases).padStart(5)} | ` +
        `${pct(s.underweightPct).padStart(5)} | ${pct(s.stuntedPct).padStart(5)} | ` +
        `${pct(s.wastedPct).padStart(5)} | ${pct(s.overweightPct).padStart(5)} | ${status}`
    );
  }
}

function printDistribution(plans, projected) {
  const counts = {};
  for (const p of plans) {
    const severity = projected.get(p.name).severity;
    counts[severity] = (counts[severity] || 0) + 1;
  }
  console.log("\nSeverity distribution:", JSON.stringify(counts));
  const mismatches = plans.filter((p) => projected.get(p.name).severity !== p.severity);
  if (mismatches.length) {
    console.log(`WARNING: ${mismatches.length} barangay(s) did not match the planned tier:`);
    for (const p of mismatches) console.log(`  - ${p.name}: planned ${p.severity}, projected ${projected.get(p.name).severity}`);
  } else {
    console.log("All barangays matched their planned map tier.");
  }
}

// ---------- validation ----------
function validateGeneratedRows(plans, children, generated) {
  const childById = new Map(children.map((c) => [c._tempId, c]));
  const abnormalNormal = new Set();
  const classificationMismatches = [];
  const heightDecreases = [];
  const lastHeight = new Map();

  for (const row of generated.assessmentRows) {
    const child = childById.get(row.child_id);
    if (!child) continue;

    const reclassified = classifyMeas(child.gender, row.age_in_months, row.weight, row.height);
    if (
      reclassified.wfa_status !== row.wfa_status ||
      reclassified.hfa_status !== row.hfa_status ||
      reclassified.wfl_h_status !== row.wfl_h_status
    ) {
      if (classificationMismatches.length < 5) {
        classificationMismatches.push({
          child: child.name,
          date: row.date_measured,
          weight: row.weight,
          height: row.height,
          age: row.age_in_months,
          stored: [row.wfa_status, row.hfa_status, row.wfl_h_status],
          reclassified: [reclassified.wfa_status, reclassified.hfa_status, reclassified.wfl_h_status],
        });
      }
    }

    if (!child._casePlan && (row.wfa_status !== "Normal" || row.hfa_status !== "Normal" || row.wfl_h_status !== "Normal")) {
      abnormalNormal.add(child.name);
    }

    const prev = lastHeight.get(child._tempId);
    if (prev !== undefined && row.height < prev) {
      if (heightDecreases.length < 5) heightDecreases.push({ child: child.name, date: row.date_measured, prev, now: row.height });
    }
    lastHeight.set(child._tempId, row.height);
  }

  return {
    abnormalNormal: [...abnormalNormal],
    classificationMismatches,
    heightDecreases,
  };
}

function periodAbnormalCounts(rows, childBarangayMap) {
  const map = new Map();
  for (const row of rows) {
    const barangay = childBarangayMap.get(row.child_id);
    const period = periodKeyForMonth(row.date_measured.slice(0, 7));
    if (!map.has(barangay)) map.set(barangay, new Map());
    const periods = map.get(barangay);
    if (!periods.has(period)) periods.set(period, new Set());
    if (row.wfa_status !== "Normal" || row.hfa_status !== "Normal" || row.wfl_h_status !== "Normal") {
      periods.get(period).add(row.child_id);
    }
  }
  const out = new Map();
  for (const [barangay, periods] of map) {
    out.set(barangay, [...periods.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, set]) => [p, set.size]));
  }
  return out;
}

// ---------- main ----------
async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  if (apply && dryRun) throw new Error("Choose either --dry-run or --apply, not both");
  const today = todayInManila();
  const allNames = barangays.map((b) => b.name);
  const targetBarangays = allNames.filter((name) => name !== EXCLUDED_BARANGAY);

  // Safety assertions before any database call.
  if (!allNames.includes(EXCLUDED_BARANGAY)) throw new Error(`${EXCLUDED_BARANGAY} missing from barangays.json`);
  if (targetBarangays.length !== allNames.length - 1) throw new Error("Target barangay list is not exactly all-except-Tanggoy");
  if (targetBarangays.includes(EXCLUDED_BARANGAY)) throw new Error("Tanggoy must never be in the target list");

  console.log(`\n=== All other barangays reset + reseed (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`today: ${today} | current month: ${CURRENT_MONTH}`);
  console.log(`targets: ${targetBarangays.length} barangays | excluded: ${EXCLUDED_BARANGAY}\n`);

  const existing = await fetchTargetChildren(targetBarangays);
  const existingIds = existing.map((row) => row.id);
  const existingAssessments = existingIds.length ? await countFor("tbl_assessments", "child_id", existingIds) : 0;
  const existingSupplements = existingIds.length ? await countFor("tbl_supplements", "child_id", existingIds) : 0;
  const tanggoyBefore = await countByBarangay(EXCLUDED_BARANGAY);
  const usersBefore = await countTable("tbl_users");

  console.log(`Existing target children: ${existing.length}`);
  console.log(`  linked assessments: ${existingAssessments} | linked supplement logs: ${existingSupplements}`);
  console.log(`  Tanggoy children (must stay untouched): ${tanggoyBefore} | tbl_users rows: ${usersBefore}\n`);

  const plans = buildAllPlans(targetBarangays, today);
  const children = plans.flatMap((p) => p.children);

  // Validate the calibration plan itself before generating any rows.
  let planWarnings = 0;
  for (const p of plans) {
    const expected = severityFromCounts(expectedCountsFromPlan(p.plan), p.childCount);
    if (expected !== p.severity) {
      planWarnings += 1;
      console.log(`WARNING: ${p.name} plan targets ${p.severity} but expected counts give ${expected}`);
    }
  }
  if (planWarnings === 0) console.log("Calibration plans match their intended map tiers.\n");

  console.log(`Generating ${children.length} children and their 2026 assessment histories...`);
  const generated = generateRows(children, today);
  const projected = computeCurrentMonthSeverity(generated.assessmentRows, generated.childBarangayMap, targetBarangays);

  console.log(
    `  children: ${children.length} | assessments: ${generated.assessmentRows.length} | supplements: ${generated.supplementRows.length}`
  );
  console.log(
    `  misfires: ${generated.stats.misfires} | target misses: ${generated.stats.targetMisses} | date/period mismatches: ${generated.stats.datePeriodMismatches}`
  );
  if (generated.stats.misfireDetails.length) {
    console.log("  first misfires:");
    for (const d of generated.stats.misfireDetails) {
      console.log(
        `    ${d.barangay} | ${d.child} | ${d.date} | age ${d.age} | ${d.profile}/${d.pattern} | target ${d.target} | first=${d.first} | prev=${d.prev}`
      );
    }
  }

  printProjection(plans, projected);
  printDistribution(plans, projected);

  const invalidTotal = plans.filter((p) => projected.get(p.name).total !== p.childCount);
  if (invalidTotal.length) {
    console.log(`\nWARNING: ${invalidTotal.length} barangay(s) have a current-month total different from their child count:`);
    for (const p of invalidTotal) console.log(`  - ${p.name}: ${projected.get(p.name).total}/${p.childCount}`);
  }

  const validation = validateGeneratedRows(plans, children, generated);
  console.log(`\nClassification mismatches: ${validation.classificationMismatches.length}`);
  if (validation.classificationMismatches.length) console.log(validation.classificationMismatches);
  console.log(`Ordinary children with an abnormal row: ${validation.abnormalNormal.length} (expected 0)`);
  if (validation.abnormalNormal.length) console.log(`  ! ${validation.abnormalNormal.slice(0, 10).join(", ")}`);
  console.log(`Height decreases: ${validation.heightDecreases.length} (expected 0)`);
  if (validation.heightDecreases.length) console.log(validation.heightDecreases);

  const movement = periodAbnormalCounts(generated.assessmentRows, generated.childBarangayMap);
  const flat = [...movement.entries()].filter(([, periods]) => new Set(periods.map(([, n]) => n)).size <= 1);
  console.log(`Barangays with dynamic monthly abnormal counts: ${movement.size - flat.length}/${movement.size}`);
  for (const [barangay, periods] of movement) {
    console.log(`  ${barangay.padEnd(24)} ${periods.map(([p, n]) => `${p}=${n}`).join(" ")}`);
  }

  const severityMismatches = plans.filter((p) => projected.get(p.name).severity !== p.severity);
  const dynamicBarangays = [...movement.values()].filter(
    (periods) => new Set(periods.map(([, count]) => count)).size > 1
  ).length;
  const preflightFailures = [];
  if (planWarnings) preflightFailures.push(`${planWarnings} plan(s) have invalid severity targets`);
  if (generated.stats.misfires) preflightFailures.push(`${generated.stats.misfires} assessment row(s) could not be generated`);
  if (generated.stats.targetMisses) preflightFailures.push(`${generated.stats.targetMisses} assessment row(s) missed their planned status`);
  if (generated.stats.datePeriodMismatches) preflightFailures.push(`${generated.stats.datePeriodMismatches} child history/horizon mismatch(es)`);
  if (invalidTotal.length) preflightFailures.push(`${invalidTotal.length} barangay(es) lack a current-month assessment for every child`);
  if (severityMismatches.length) preflightFailures.push(`${severityMismatches.length} projected Barangay Map tier(s) do not match the plan`);
  if (
    validation.classificationMismatches.length ||
    validation.abnormalNormal.length ||
    validation.heightDecreases.length
  ) {
    preflightFailures.push("generated measurements/statuses failed consistency checks");
  }
  if (!dynamicBarangays) preflightFailures.push("assessment histories show no month-to-month nutritional-status movement");
  if (preflightFailures.length) {
    throw new Error(`Preflight failed; no database writes performed:\n  - ${preflightFailures.join("\n  - ")}`);
  }
  console.log(`Preflight passed: all histories and map tiers validated; ${dynamicBarangays} barangay(s) show dynamic trends.`);

  if (!apply) {
    console.log("\nNo writes performed. Re-run with --apply to reset and reseed.\n");
    return;
  }

  console.log("\nStep 1/4: hard-deleting existing target-barangay data...");
  if (existingIds.length) {
    await deleteForIds("tbl_supplements", "child_id", existingIds);
    await deleteForIds("tbl_assessments", "child_id", existingIds);
    await deleteForIds("tbl_children", "id", existingIds);
  }
  const remaining = await fetchTargetChildren(targetBarangays);
  if (remaining.length) throw new Error(`Delete left ${remaining.length} target children behind`);
  const tanggoyAfterDelete = await countByBarangay(EXCLUDED_BARANGAY);
  if (tanggoyAfterDelete !== tanggoyBefore) {
    throw new Error(`Tanggoy child count changed during delete: ${tanggoyBefore} -> ${tanggoyAfterDelete}`);
  }
  console.log(`  target children remaining: 0 | Tanggoy still: ${tanggoyAfterDelete}\n`);

  console.log("Step 2/4: inserting children...");
  const cleanChildren = children.map(({ _tempId, _normalProfile, _casePlan, _periods, ...row }) => row);
  const inserted = await insertChunked("tbl_children", cleanChildren, "id, name, dob, gender, barangay");
  if (inserted.length !== children.length) throw new Error(`Inserted ${inserted.length} children, expected ${children.length}`);
  const idMap = new Map();
  inserted.forEach((row, i) => idMap.set(children[i]._tempId, row.id));
  console.log(`  inserted ${inserted.length} children\n`);

  console.log("Step 3/4: inserting assessments...");
  replaceChildIds(generated.assessmentRows, idMap);
  await insertChunked("tbl_assessments", generated.assessmentRows);
  console.log(`  inserted ${generated.assessmentRows.length} assessments\n`);

  console.log("Step 4/4: inserting supplement logs...");
  replaceChildIds(generated.supplementRows, idMap);
  await insertChunked("tbl_supplements", generated.supplementRows);
  console.log(`  inserted ${generated.supplementRows.length} supplement logs\n`);

  const finalChildren = await fetchTargetChildren(targetBarangays);
  const finalIds = finalChildren.map((row) => row.id);
  const finalAssessments = await countFor("tbl_assessments", "child_id", finalIds);
  const finalSupplements = await countFor("tbl_supplements", "child_id", finalIds);
  const tanggoyAfter = await countByBarangay(EXCLUDED_BARANGAY);
  const usersAfter = await countTable("tbl_users");

  console.log("=== Done ===");
  console.log(`  target children: ${finalChildren.length}`);
  console.log(`  assessments: ${finalAssessments} | supplement logs: ${finalSupplements}`);
  console.log(`  Tanggoy children: ${tanggoyAfter} (was ${tanggoyBefore})`);
  console.log(`  tbl_users rows: ${usersAfter} (was ${usersBefore})`);

  if (tanggoyAfter !== tanggoyBefore) throw new Error("Tanggoy was modified");
  if (usersAfter !== usersBefore) throw new Error("tbl_users was modified");

  const { bustAll, touchRevs } = require("../src/config/redis");
  await bustAll(["reports:*", "assessments:*", "children:*", "barangays:*", "shared:trends:*", "shared:masterlist:*"]);
  const months = [...new Set(generated.assessmentRows.map((row) => row.date_measured.slice(0, 7)))].sort();
  await touchRevs(months);
  console.log("  report and trend caches invalidated\n");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});







