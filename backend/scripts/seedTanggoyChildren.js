require("dotenv").config();

// Resets ONE barangay (Tanggoy) and repopulates it with the 70-child masterlist
// supplied by the BNS, then backfills monthly 2026 assessments (Jan-Mar counted
// as a single Q1 checkup, matching the rest of the app) and supplement logs.
//
// Hard delete is scoped to Tanggoy only:
//   tbl_supplements / tbl_assessments -> rows whose child_id belongs to a
//   Tanggoy child, then the Tanggoy rows in tbl_children themselves.
//
// Exactly 7 children are assigned a nutritional issue and each follows a
// month-by-month trajectory (recovery, temporary relapse, slow catch-up)
// instead of a static status all year; every other child is verified
// all-Normal on every assessment. Measurements are generated from the target
// WHO z-score for each month, so weight/height always agree with the status.
//
// Usage:
//   node scripts/seedTanggoyChildren.js --dry-run   (default: preview only)
//   node scripts/seedTanggoyChildren.js --apply     (writes to Supabase)

const supabase = require("../src/config/supabase");
const { weightForAgeZ, heightForAgeZ } = require("../src/services/growthReference");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const { calculateAgeInMonths, todayInManila, addMonths, periodKeyForMonth } = require("../src/utils/date");
const { WEIGHT_RANGE, HEIGHT_RANGE } = require("../src/utils/measurements");
const { getScheduleWindows } = require("../src/services/supplementSchedule.service");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const BARANGAY = "Tanggoy";
const YEAR = 2026;
const CHUNK_SIZE = 200;
const MAX_AGE_MONTHS = 59;

// [name, gender, dob] — verbatim from the BNS masterlist.
const CHILDREN = [
  ["Prince Geo Legaspi", "Male", "2021-02-28"],
  ["Weldion Dela Cuesta", "Male", "2021-02-12"],
  ["Nicko Marquinez", "Male", "2021-07-05"],
  ["John Randolf Depusoy", "Male", "2021-11-04"],
  ["Zhacary Aiden Josh Masangkay", "Male", "2021-11-09"],
  ["Prince Reyver Plata", "Male", "2022-01-10"],
  ["Enzo Mateo Macalalad", "Male", "2022-04-19"],
  ["Vincent Laurenti", "Male", "2022-07-28"],
  ["Craige Anthony Sale", "Male", "2022-07-30"],
  ["Renzo Isaac Mendoza", "Male", "2022-11-03"],
  ["John Chris Briones", "Male", "2022-11-02"],
  ["Jared Depusoy", "Male", "2023-03-05"],
  ["John Mike Garcia", "Male", "2023-03-30"],
  ["Jezrine Plata", "Male", "2023-03-31"],
  ["Carlos Castromero", "Male", "2023-05-07"],
  ["Wilford Dela Cuesta", "Male", "2023-05-12"],
  ["Reinn Baon", "Male", "2023-11-25"],
  ["Jairen Smith Dellosa", "Male", "2024-02-03"],
  ["Leigh Gabrielle Pante", "Male", "2024-02-17"],
  ["Noah Emmanuel Codizal", "Male", "2024-05-04"],
  ["Elijah Noel Lopez", "Male", "2024-07-01"],
  ["Rhez Andrei Lambujon", "Male", "2024-07-14"],
  ["John Kyle Manguiat", "Male", "2024-07-28"],
  ["Rhys Kirie Daylusan", "Male", "2024-09-06"],
  ["Riley Reonal", "Male", "2024-09-13"],
  ["Samuel Dalawampu", "Male", "2024-10-14"],
  ["Ren Kyler Bagunas", "Male", "2024-10-29"],
  ["Johann Clifford Bacalla", "Male", "2024-11-25"],
  ["Zion Resgonia", "Male", "2025-04-29"],
  ["Prince Erwin Nervar", "Male", "2025-06-25"],
  ["Sammuel Bandara", "Male", "2025-11-15"],
  ["John Ren Abiada", "Male", "2026-01-16"],
  ["Hans Zian Rodriguez", "Male", "2026-02-20"],
  ["Jacob De Lunas", "Male", "2026-03-12"],
  ["Rhyle John Zara", "Male", "2026-04-06"],
  ["Karin Gillian Keith", "Female", "2021-03-01"],
  ["Glen Celiene Mae Mora", "Female", "2021-03-05"],
  ["Alliyah Faith Villaviray", "Female", "2021-05-11"],
  ["Jonna Abiada", "Female", "2021-06-12"],
  ["Sienna Amber Lei Zoleta", "Female", "2021-10-29"],
  ["Ma. Edelyn Garcia", "Female", "2021-10-15"],
  ["Khryslyn Paula Alvarez", "Female", "2021-11-07"],
  ["Princess Ann Castromero", "Female", "2021-12-07"],
  ["Quinzel Hope Giron", "Female", "2022-03-15"],
  ["Ma. Isabel Garcia", "Female", "2022-10-11"],
  ["Ariana Kaye Reunal", "Female", "2022-11-22"],
  ["Jien Maddison Marasigan", "Female", "2023-04-23"],
  ["Nicamae Jamilla", "Female", "2023-06-14"],
  ["Rhiann Jenzelle Depusoy", "Female", "2023-08-04"],
  ["Zeanna Kate Mendoza", "Female", "2023-08-13"],
  ["Marian Plata", "Female", "2023-09-08"],
  ["Guiane Majesty Prigo", "Female", "2023-10-10"],
  ["Zoey Resgonia", "Female", "2023-11-03"],
  ["Viannice Abellera", "Female", "2023-12-30"],
  ["Jillian Britanny Bebing", "Female", "2024-05-11"],
  ["Kirsten Grei Bagunas", "Female", "2024-06-20"],
  ["Swarna Manel Bandara", "Female", "2024-08-10"],
  ["Erica Garcia", "Female", "2024-09-03"],
  ["Chelrian Caisip", "Female", "2024-09-24"],
  ["Chloe Elysse Depusoy", "Female", "2024-10-02"],
  ["Qeinzel Arnayah Agustin", "Female", "2024-10-13"],
  ["Yhazmine Jane Plata", "Female", "2025-02-03"],
  ["Mariella Vien Plata", "Female", "2025-05-01"],
  ["Alleah Brille Codizal", "Female", "2025-05-07"],
  ["Katriella Lois Cavitaña", "Female", "2025-06-18"],
  ["Celestine Liora Sanchez", "Female", "2025-07-11"],
  ["Mahlia Azriel Castromero", "Female", "2025-09-18"],
  ["Jane Zarielle Banastas", "Female", "2025-11-15"],
  ["Amarah Celine Manalo", "Female", "2026-03-15"],
  ["Athena Brille Bobadilla", "Female", "2026-04-08"],
];

// 2026 assessment periods in chronological order (Jan-Mar is one Q1 window).
const PERIODS = [
  "2026-Q1", "2026-04", "2026-05", "2026-06", "2026-07",
  "2026-08", "2026-09", "2026-10", "2026-11",
];
const PERIOD_INDEX = new Map(PERIODS.map((period, i) => [period, i]));

// The 7 sample cases. Each timeline is aligned with PERIODS and drives one
// indicator month by month; "Normal" means the child has recovered in that
// period. The other indicators are kept as healthy as the target allows, so a
// child's only visible issue is the one being simulated.
const CASES = {
  "Jared Depusoy": {
    wantCol: "wfa_status",
    // Underweight through mid-year, recovers in July, relapses in October.
    timeline: [
      "Underweight", "Underweight", "Underweight", "Underweight", "Normal",
      "Normal", "Normal", "Underweight", "Underweight",
    ],
  },
  "Erica Garcia": {
    wantCol: "wfa_status",
    // Severe -> moderate -> recovered in July -> mild relapse in October.
    timeline: [
      "Severely Underweight", "Severely Underweight", "Underweight", "Underweight", "Normal",
      "Normal", "Normal", "Underweight", "Underweight",
    ],
  },
  "Enzo Mateo Macalalad": {
    wantCol: "hfa_status",
    // Chronic stunting: height-for-age is slow-moving, so it stays stunted.
    timeline: Array(9).fill("Stunted"),
  },
  "Mahlia Azriel Castromero": {
    wantCol: "hfa_status",
    // Slow catch-up growth: severely stunted -> stunted by June.
    timeline: [
      "Severely Stunted", "Severely Stunted", "Severely Stunted", "Stunted", "Stunted",
      "Stunted", "Stunted", "Stunted", "Stunted",
    ],
  },
  "Jairen Smith Dellosa": {
    wantCol: "wfl_h_status",
    // Slightly lean baseline so the May-July wasting episode starts near the
    // threshold and requires only a small, illness-sized weight loss.
    normalProfile: { zW: -0.9, zH: 0.4 },
    // Temporary wasting episode in May-July, then recovers.
    timeline: [
      "Normal", "Normal", "Wasted", "Wasted", "Wasted",
      "Normal", "Normal", "Normal", "Normal",
    ],
  },
  "Zeanna Kate Mendoza": {
    wantCol: "wfa_status",
    // Overweight early in the year, back to normal by June.
    timeline: [
      "Overweight", "Overweight", "Overweight", "Normal", "Normal",
      "Normal", "Normal", "Normal", "Normal",
    ],
  },
  "Mariella Vien Plata": {
    wantCol: "wfl_h_status",
    // Obese -> overweight -> normal: a two-step improvement by August.
    timeline: [
      "Obese", "Obese", "Overweight", "Overweight", "Overweight",
      "Normal", "Normal", "Normal", "Normal",
    ],
  },
};

function targetForPeriod(child, period) {
  if (!child._case) return null;
  const idx = PERIOD_INDEX.get(period);
  if (idx === undefined) return null;
  const want = child._case.timeline[idx];
  if (!want) return null;
  return { wantCol: child._case.wantCol, want };
}


const PUROKS = [
  "Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5", "Purok 6", "Purok 7", "Purok 8",
  "Sitio Ilog", "Sitio Bukid", "Sitio Maligaya",
];

const MOTHER_NAMES = [
  "Maria", "Ana", "Rosa", "Liza", "Cristina", "Josefina", "Marilou", "Editha", "Rowena", "Beverly",
  "Catherine", "Divina", "Elena", "Flordeliza", "Gemma", "Imelda", "Jenny", "Kristine", "Lorna", "Marissa",
  "Nelia", "Ofelia", "Perlita", "Rebecca", "Salome", "Teresita", "Vilma", "Yolanda", "Zenaida", "Arlene",
];

const FATHER_NAMES = [
  "Jose", "Juan", "Pedro", "Ramon", "Ricardo", "Roberto", "Eduardo", "Fernando", "Alfredo", "Benigno",
  "Carlos", "Dante", "Ernesto", "Fidel", "Gregorio", "Hector", "Ignacio", "Jaime", "Leandro", "Manuel",
  "Nestor", "Orlando", "Pablo", "Rogelio", "Salvador", "Tomas", "Ulysses", "Victor", "Wilfredo", "Zacarias",
];

const PHONE_PREFIXES = [
  "0917", "0918", "0919", "0920", "0921", "0927", "0928", "0929", "0930", "0935",
  "0936", "0938", "0939", "0945", "0946", "0947", "0948", "0949", "0950", "0951",
  "0956", "0961", "0963", "0966", "0967", "0970", "0975", "0976", "0977", "0978",
  "0979", "0985", "0989", "0994", "0995", "0996", "0997", "0998", "0999",
];

// ---------- small helpers ----------
function hashString(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function gaussian(mean = 0, sd = 1) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
}
function clamp(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function phContact(name) {
  const h = hashString(`contact|${name}`);
  const prefix = PHONE_PREFIXES[h % PHONE_PREFIXES.length];
  let digits = "";
  let seed = h;
  for (let i = 0; i < 7; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    digits += String(seed % 10);
  }
  return `${prefix}${digits}`;
}
function surnameOf(name) {
  const cleaned = name.replace(/^(Ma\.|Maria)\s+/i, "");
  return cleaned.split(/\s+/).pop();
}
// Ordinary children need a profile that stays all-Normal at EVERY age the
// child will be measured at. Weight and height therefore share one base
// z-score (small independent noise only): independent draws let weight and
// height drift apart, which the WHO weight-for-height reference reads as
// wasting/overweight. Each candidate is validated against the real
// classifier across the 0-60 month range before being accepted.
const NORMAL_PROBE_AGES = [0, 1, 2, 6, 12, 18, 24, 36, 48, 54, 60];
function buildNormalProfile(gender) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const base = clamp(gaussian(0, 0.45), -1.1, 1.1);
    const zW = base + gaussian(0, 0.08);
    const zH = base + gaussian(0, 0.08);
    if (
      NORMAL_PROBE_AGES.every((age) => {
        const s = statusesFor(gender, age, zW, zH);
        return s.wfa_status === "Normal" && s.hfa_status === "Normal" && s.wfl_h_status === "Normal";
      })
    ) {
      return { zW, zH };
    }
  }
  return { zW: 0, zH: 0 };
}

function buildChildRow([name, gender, dob]) {
  const h = hashString(name);
  const surname = surnameOf(name);
  const pool = h % 2 === 0 ? MOTHER_NAMES : FATHER_NAMES;
  const parentFirst = pool[(h >>> 3) % pool.length];
  return {
    name,
    dob,
    gender,
    barangay: BARANGAY,
    purok: PUROKS[(h >>> 7) % PUROKS.length],
    parent_name: `${parentFirst} ${surname}`,
    parent_contact: phContact(name),
    is_ip: (h >>> 11) % 100 < 6,
    status: "active",
    _case: CASES[name] || null,
    _profile: CASES[name] ? null : buildNormalProfile(gender),
  };
}

// Bisection inverse of a monotonic z-score function (same approach used by the
// other seed scripts) so raw measurements can be generated from a target z.
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
function statusesFor(gender, age, zW, zH) {
  const { weight, height } = measurementsForZ(gender, age, zW, zH);
  const statuses = classifyNutritionStatus({
    sex: gender,
    ageInMonths: age,
    weightKg: weight,
    heightCm: height,
  });
  return { weight, height, ...statuses };
}

// Finds a z-pair for a case child's FIRST assessment. Prefers combos where
// only the wanted indicator is abnormal, then the least extreme measurements.
function findCaseZPair(gender, age, wantCol, want) {
  let best = null;
  let bestScore = Infinity;
  for (let zw = -3.6; zw <= 3.61; zw += 0.3) {
    for (let zh = -3.6; zh <= 3.61; zh += 0.3) {
      const s = statusesFor(gender, age, zw, zh);
      if (s[wantCol] !== want) continue;
      const abnormal = ["wfa_status", "hfa_status", "wfl_h_status"].filter((c) => s[c] !== "Normal").length;
      const score = abnormal * 100 + Math.abs(zw) + Math.abs(zh);
      if (score < bestScore) {
        bestScore = score;
        best = { zW: zw, zH: zh };
      }
    }
  }
  return best;
}

// Closest all-Normal z-pair to the median, used for a case child whose first
// planned period is already "Normal".
function findNormalZPair(gender, age) {
  let best = null;
  let bestScore = Infinity;
  for (let zw = -1.8; zw <= 1.81; zw += 0.2) {
    for (let zh = -1.8; zh <= 1.81; zh += 0.2) {
      const s = statusesFor(gender, age, zw, zh);
      if (s.wfa_status !== "Normal" || s.hfa_status !== "Normal" || s.wfl_h_status !== "Normal") continue;
      const score = Math.abs(zw) + Math.abs(zh);
      if (score < bestScore) {
        bestScore = score;
        best = { zW: zw, zH: zh };
      }
    }
  }
  return best || { zW: 0, zH: 0 };
}

function monthsBetween(fromDate, toDate) {
  const [fy, fm] = fromDate.split("-").map(Number);
  const [ty, tm] = toDate.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm));
}

// Per-month growth caps used to keep consecutive checkups physically plausible
// (a child never shrinks, and weight/height only move within a sane envelope).
function monthlyGrowthCaps(ageInMonths) {
  if (ageInMonths < 3) return { weight: 1.5, height: 5.0 };
  if (ageInMonths < 12) return { weight: 1.3, height: 3.0 };
  if (ageInMonths < 36) return { weight: 1.2, height: 2.0 };
  return { weight: 1.0, height: 1.2 };
}

function isAllNormal(statuses) {
  return (
    statuses.wfa_status === "Normal" &&
    statuses.hfa_status === "Normal" &&
    statuses.wfl_h_status === "Normal"
  );
}

function matchesTarget(statuses, target) {
  if (!target) return isAllNormal(statuses);
  if (target.want === "Normal") return isAllNormal(statuses);
  return statuses[target.wantCol] === target.want;
}

function medianAt(zFn, gender, ageInMonths, range) {
  return inverseZ((x) => zFn(gender, ageInMonths, x), 0, range.min, range.max);
}

// Searches actual weight/height pairs inside the plausible envelope around the
// previous checkup, keeping the candidate closest to normal age-appropriate
// growth. Because candidates are the REAL measurements (not z-scores), the
// stored weight/height and the stored status can never disagree.
function searchMeasurementRow(child, age, target, prev, elapsedMonths) {
  const gender = child.gender;
  const caps = monthlyGrowthCaps(age);
  const maxGainW = caps.weight * elapsedMonths;
  const maxGainH = caps.height * elapsedMonths;
  const maxLossW = 0.8 * elapsedMonths;
  const prevAge = Math.max(0, age - elapsedMonths);

  const wNow = medianAt(weightForAgeZ, gender, age, WEIGHT_RANGE);
  const wPrev = medianAt(weightForAgeZ, gender, prevAge, WEIGHT_RANGE);
  const hNow = medianAt(heightForAgeZ, gender, age, HEIGHT_RANGE);
  const hPrev = medianAt(heightForAgeZ, gender, prevAge, HEIGHT_RANGE);
  const expectedW = prev.weight + (wNow - wPrev);
  const expectedH = prev.height + (hNow - hPrev);

  for (const relax of [1, 1.6, 2.4]) {
    let best = null;
    let bestScore = Infinity;
    const wLo = Math.max(WEIGHT_RANGE.min, prev.weight - maxLossW * relax);
    const wHi = Math.min(WEIGHT_RANGE.max, prev.weight + maxGainW * relax);
    const hLo = prev.height; // children never get shorter
    const hHi = Math.min(HEIGHT_RANGE.max, prev.height + maxGainH * relax);

    for (let w = wLo; w <= wHi + 1e-9; w += 0.1) {
      const weight = round1(clamp(w, WEIGHT_RANGE.min, WEIGHT_RANGE.max));
      for (let h = hLo; h <= hHi + 1e-9; h += 0.1) {
        const height = round1(clamp(h, HEIGHT_RANGE.min, HEIGHT_RANGE.max));
        const statuses = classifyNutritionStatus({
          sex: gender,
          ageInMonths: age,
          weightKg: weight,
          heightCm: height,
        });
        if (!matchesTarget(statuses, target)) continue;

        // Prefer the natural growth expectation, discourage weight loss, and
        // (for the 7 cases) lightly prefer keeping the other indicators normal.
        let score = Math.abs(weight - expectedW) + 1.2 * Math.abs(height - expectedH);
        score += Math.max(0, prev.weight - weight) * 2.5;
        if (target && target.want !== "Normal") {
          const extra = ["wfa_status", "hfa_status", "wfl_h_status"].filter(
            (col) => col !== target.wantCol && statuses[col] !== "Normal"
          ).length;
          score += extra * 0.6;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { weight, height, statuses };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// One assessment row for (child, date). The first checkup is seeded from the
// target status; every later checkup is searched within a plausible growth
// envelope from the previous one, so trajectories progress smoothly and the
// stored measurements always reproduce the stored classification.
function buildAssessmentRow(child, dateMeasured, age, period) {
  const target = targetForPeriod(child, period);
  let picked = null;

  if (!child._lastM) {
    for (let attempt = 0; attempt < 200 && !picked; attempt++) {
      let base;
      if (target && target.want === "Normal") {
        base = (child._case && child._case.normalProfile) || findNormalZPair(child.gender, age);
      } else if (target) {
        base = findCaseZPair(child.gender, age, target.wantCol, target.want);
        if (!base) break;
      } else {
        base = child._profile;
      }
      const zW = base.zW + gaussian(0, 0.08);
      const zH = base.zH + gaussian(0, 0.08);
      const s = statusesFor(child.gender, age, zW, zH);
      if (matchesTarget(s, target)) picked = { weight: s.weight, height: s.height, statuses: s };
    }
  } else {
    const elapsedMonths = monthsBetween(child._lastDate, dateMeasured);
    picked = searchMeasurementRow(child, age, target, child._lastM, elapsedMonths);
  }

  if (!picked) return { row: null, ok: false, target };

  child._lastM = { weight: picked.weight, height: picked.height };
  child._lastDate = dateMeasured;

  return {
    row: {
      child_id: child.id,
      date_measured: dateMeasured,
      weight: picked.weight,
      height: picked.height,
      age_in_months: age,
      wfa_status: picked.statuses.wfa_status,
      hfa_status: picked.statuses.hfa_status,
      wfl_h_status: picked.statuses.wfl_h_status,
      submission_status: "submitted",
      status: "active",
    },
    ok: true,
    target,
  };
}

// Jan-Mar 2026 is one Q1 checkup window (the app renders it as a single trend
// point), so each child gets one Q1 row plus every month from April to the
// current month, skipping any month before birth or after the 59-month cutoff.
function assessmentDatesForChild(dob, today) {
  const startMonth = dob.slice(0, 7) > `${YEAR}-01` ? dob.slice(0, 7) : `${YEAR}-01`;
  const endMonth = today.slice(0, 7);
  const seenPeriods = new Set();
  const out = [];

  let month = startMonth;
  while (month <= endMonth) {
    const period = periodKeyForMonth(month);
    if (!seenPeriods.has(period)) {
      seenPeriods.add(period);
      let day;
      if (month === dob.slice(0, 7)) {
        day = Math.min(28, Math.max(Number(dob.slice(8, 10)) + 5, 10));
      } else if (period.endsWith("-Q1")) {
        day = 10 + (hashString(`${dob}|${period}`) % 5); // 10th-14th
      } else {
        day = 5 + (hashString(`${dob}|${month}`) % 6); // 5th-10th
      }
      const date = `${month}-${String(day).padStart(2, "0")}`;
      if (date >= dob && date <= today) out.push(date);
    }
    month = addMonths(month, 1);
  }

  return out.filter((date) => calculateAgeInMonths(dob, date) <= MAX_AGE_MONTHS);
}

function buildSupplementRows(child, today) {
  const dobMonth = child.dob.slice(0, 7);
  const currentAge = Math.min(calculateAgeInMonths(child.dob, today), 59);
  const rows = [];
  for (const supplementType of ["Vitamin A", "Deworming"]) {
    for (const w of getScheduleWindows(supplementType)) {
      if (w.start_month > currentAge) break;
      if (hashString(`${child.name}|${supplementType}|${w.dose_order}`) % 100 < 15) continue; // ~15% missed
      const date = `${addMonths(dobMonth, w.start_month)}-10`;
      if (date > today) continue;
      rows.push({
        child_id: child.id,
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

async function fetchTanggoyChildren() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("tbl_children")
      .select("id, name, status")
      .eq("barangay", BARANGAY)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Failed to fetch Tanggoy children: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
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

async function deleteForIds(table, ids) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from(table).delete().in("child_id", ids.slice(i, i + CHUNK_SIZE));
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

async function main() {
  const apply = process.argv.includes("--apply");
  const today = todayInManila();

  console.log(`\n=== Tanggoy reset + reseed (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`barangay: ${BARANGAY} | today: ${today} | children: ${CHILDREN.length}\n`);

  const existing = await fetchTanggoyChildren();
  console.log(`Existing Tanggoy children (all statuses): ${existing.length}`);
  const existingIds = existing.map((r) => r.id);
  const existingAssessmentCount = existingIds.length ? await countFor("tbl_assessments", "child_id", existingIds) : 0;
  const existingSupplementCount = existingIds.length ? await countFor("tbl_supplements", "child_id", existingIds) : 0;
  console.log(`  linked assessments: ${existingAssessmentCount} | linked supplement logs: ${existingSupplementCount}\n`);

  const childRows = CHILDREN.map(buildChildRow);
  const seen = new Set();
  for (const row of childRows) {
    if (seen.has(row.name)) throw new Error(`Duplicate name in masterlist: ${row.name}`);
    seen.add(row.name);
  }
  const caseNames = childRows.filter((r) => r._case).map((r) => r.name);
  if (caseNames.length !== 7) throw new Error(`Expected exactly 7 case children, got ${caseNames.length}`);

  if (!apply) {
    console.log("New children preview (first 5):");
    for (const row of childRows.slice(0, 5)) {
      const { _case, _profile, ...clean } = row;
      console.log("  ", JSON.stringify(clean));
    }
    console.log("\nSample cases (2026 trajectory):");
    for (const row of childRows.filter((r) => r._case)) {
      console.log(`   ${row.name} (${row.gender}, ${row.dob}) -> ${row._case.wantCol}: ${row._case.timeline.join(" -> ")}`);
    }

    // Validate assessment generation in memory too, so a dry run catches
    // targets the WHO tables cannot satisfy at a given age.
    let misfires = 0;
    let targetMisses = 0;
    let total = 0;
    const perCase = {};
    const caseTimelines = {};
    const normalAbnormal = new Set();
    for (const child of childRows) {
      const dates = assessmentDatesForChild(child.dob, today);
      for (const date of dates) {
        const age = calculateAgeInMonths(child.dob, date);
        const period = periodKeyForMonth(date.slice(0, 7));
        const built = buildAssessmentRow(child, date, age, period);
        total += 1;
        if (!built.ok || !built.row) {
          misfires += 1;
          continue;
        }
        if (child._case) {
          const key = `${child.name} -> ${child._case.wantCol}`;
          perCase[key] = perCase[key] || {};
          const actual = built.row[child._case.wantCol];
          perCase[key][actual] = (perCase[key][actual] || 0) + 1;
          caseTimelines[child.name] = caseTimelines[child.name] || {};
          caseTimelines[child.name][period] = actual;
          if (built.target && actual !== built.target.want) targetMisses += 1;
        } else if (
          built.row.wfa_status !== "Normal" ||
          built.row.hfa_status !== "Normal" ||
          built.row.wfl_h_status !== "Normal"
        ) {
          normalAbnormal.add(child.name);
        }
      }
    }
    console.log(`\nAssessments that would be created: ${total} (misfires: ${misfires}, target misses: ${targetMisses})`);
    console.log(`Ordinary children with a non-Normal row: ${normalAbnormal.size} (expected 0)`);
    if (normalAbnormal.size) console.log(`  ! ${[...normalAbnormal].join(", ")}`);
    console.log("\nCase child trajectories (period=status):");
    for (const [name, timeline] of Object.entries(caseTimelines)) {
      const parts = PERIODS.filter((p) => timeline[p]).map((p) => `${p}=${timeline[p]}`);
      console.log(`   ${name}: ${parts.join("  ")}`);
    }
    console.log("\nCase child status counts:");
    for (const [key, tally] of Object.entries(perCase)) console.log(`   ${key}: ${JSON.stringify(tally)}`);
    console.log(`\nSupplement logs that would be created: ${childRows.reduce((n, c) => n + buildSupplementRows(c, today).length, 0)}`);
    console.log("\nNo writes performed. Re-run with --apply to reset and reseed.");
    process.exit(0);
  }

  console.log("Step 1/4: hard-deleting existing Tanggoy data...");
  if (existingIds.length) {
    await deleteForIds("tbl_supplements", existingIds);
    await deleteForIds("tbl_assessments", existingIds);
  }
  const { error: childDeleteError } = await supabase.from("tbl_children").delete().eq("barangay", BARANGAY);
  if (childDeleteError) throw new Error(`Failed to delete Tanggoy children: ${childDeleteError.message}`);
  const remaining = await fetchTanggoyChildren();
  console.log(`  remaining Tanggoy children after delete: ${remaining.length}\n`);

  console.log("Step 2/4: inserting children...");
  const inserted = await insertChunked(
    "tbl_children",
    childRows.map(({ _case, _profile, ...row }) => row),
    "id, name, dob, gender"
  );
  if (inserted.length !== childRows.length) {
    throw new Error(`Inserted ${inserted.length} children, expected ${childRows.length}`);
  }
  const byName = new Map(childRows.map((row) => [row.name, row]));
  const children = inserted.map((row) => ({ ...byName.get(row.name), id: row.id }));
  console.log(`  inserted ${children.length} children\n`);

  console.log("Step 3/4: generating assessments...");
  const assessmentRows = [];
  let misfires = 0;
  for (const child of children) {
    for (const date of assessmentDatesForChild(child.dob, today)) {
      const age = calculateAgeInMonths(child.dob, date);
      const period = periodKeyForMonth(date.slice(0, 7));
      const built = buildAssessmentRow(child, date, age, period);
      if (!built.row) {
        misfires += 1;
        continue;
      }
      if (!built.ok) misfires += 1;
      assessmentRows.push(built.row);
    }
  }
  await insertChunked("tbl_assessments", assessmentRows);
  console.log(`  inserted ${assessmentRows.length} assessments (misfires: ${misfires})\n`);

  console.log("Step 4/4: generating supplement logs...");
  const supplementRows = children.flatMap((child) => buildSupplementRows(child, today));
  await insertChunked("tbl_supplements", supplementRows);
  console.log(`  inserted ${supplementRows.length} supplement logs\n`);

  // Verify final state.
  const finalChildren = await fetchTanggoyChildren();
  const finalIds = finalChildren.map((r) => r.id);
  const finalAssessments = await countFor("tbl_assessments", "child_id", finalIds);
  const finalSupplements = await countFor("tbl_supplements", "child_id", finalIds);
  const caseChildIds = new Set(children.filter((c) => c._case).map((c) => c.id));
  const abnormalChildIds = new Set();

  for (let i = 0; i < finalIds.length; i += CHUNK_SIZE) {
    const { data, error } = await supabase
      .from("tbl_assessments")
      .select("child_id, wfa_status, hfa_status, wfl_h_status")
      .in("child_id", finalIds.slice(i, i + CHUNK_SIZE))
      .eq("status", "active");
    if (error) throw new Error(`Verification read failed: ${error.message}`);
    for (const row of data) {
      if (row.wfa_status !== "Normal" || row.hfa_status !== "Normal" || row.wfl_h_status !== "Normal") {
        abnormalChildIds.add(row.child_id);
      }
    }
  }

  console.log("=== Done ===");
  console.log(`  children in Tanggoy: ${finalChildren.length}`);
  console.log(`  assessments: ${finalAssessments} | supplement logs: ${finalSupplements}`);
  console.log(`  children with an abnormal assessment: ${abnormalChildIds.size} (expected 7)`);
  const unexpected = [...abnormalChildIds].filter((id) => !caseChildIds.has(id));
  const missing = [...caseChildIds].filter((id) => !abnormalChildIds.has(id));
  if (unexpected.length || missing.length) {
    console.log(`  WARNING: unexpected abnormal children=${unexpected.length}, case children with no abnormal row=${missing.length}`);
    process.exitCode = 1;
  } else {
    console.log("  verification OK: exactly the 7 sample-case children carry nutritional issues.");
  }
  console.log("");
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
