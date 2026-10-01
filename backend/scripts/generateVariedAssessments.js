require("dotenv").config();

const supabase = require("../src/config/supabase");
const { calculateAgeInMonths, toMonthRange } = require("../src/utils/date");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const {
  weightForAgeZ, heightForAgeZ, weightForHeightZ,
} = require("../src/services/growthReference");

const MONTH = process.argv[2] || "2026-09";
const PAGE_SIZE = 1000;

if (!supabase) {
  console.error("Supabase is not configured.");
  process.exit(1);
}

function round1(x) { return Math.round(x * 10) / 10; }

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

// --- WHO LMS tables (same as growthReference.js) ---
const WFA_BOYS = [
  [0.3487,3.3464,0.14602],[0.2297,4.4709,0.13395],[0.1970,5.5675,0.12385],[0.1738,6.3762,0.11727],
  [0.1553,7.0023,0.11316],[0.1395,7.5105,0.11080],[0.1257,7.9340,0.10958],[0.1134,8.2970,0.10902],
  [0.1021,8.6151,0.10882],[0.0917,8.9014,0.10881],[0.0820,9.1649,0.10891],[0.0730,9.4122,0.10906],
  [0.0644,9.6479,0.10925],[0.0563,9.8749,0.10949],[0.0487,10.0953,0.10976],[0.0413,10.3108,0.11007],
  [0.0343,10.5228,0.11041],[0.0275,10.7319,0.11079],[0.0211,10.9385,0.11119],[0.0148,11.1430,0.11164],
  [0.0087,11.3462,0.11211],[0.0029,11.5486,0.11261],[-0.0028,11.7504,0.11314],[-0.0083,11.9514,0.11369],
  [-0.0137,12.1515,0.11426],[-0.0189,12.3502,0.11485],[-0.0240,12.5466,0.11544],[-0.0289,12.7401,0.11604],
  [-0.0337,12.9303,0.11664],[-0.0385,13.1169,0.11723],[-0.0431,13.3000,0.11781],[-0.0476,13.4798,0.11839],
  [-0.0520,13.6567,0.11896],[-0.0564,13.8309,0.11953],[-0.0606,14.0031,0.12008],[-0.0648,14.1736,0.12062],
  [-0.0689,14.3429,0.12116],[-0.0729,14.5113,0.12168],[-0.0769,14.6791,0.12220],[-0.0808,14.8466,0.12271],
  [-0.0846,15.0140,0.12322],[-0.0883,15.1813,0.12373],[-0.0920,15.3486,0.12425],[-0.0957,15.5158,0.12478],
  [-0.0993,15.6828,0.12531],[-0.1028,15.8497,0.12586],[-0.1063,16.0163,0.12643],[-0.1097,16.1827,0.12700],
  [-0.1131,16.3489,0.12759],[-0.1165,16.5150,0.12819],[-0.1198,16.6811,0.12880],[-0.1230,16.8471,0.12943],
  [-0.1262,17.0132,0.13005],[-0.1294,17.1792,0.13069],[-0.1325,17.3452,0.13133],[-0.1356,17.5111,0.13197],
  [-0.1387,17.6768,0.13261],[-0.1417,17.8422,0.13325],[-0.1447,18.0073,0.13389],[-0.1477,18.1722,0.13453],
  [-0.1506,18.3366,0.13517],
];
const WFA_GIRLS = [
  [0.3809,3.2322,0.14171],[0.1714,4.1873,0.13724],[0.0962,5.1282,0.13000],[0.0402,5.8458,0.12619],
  [-0.0050,6.4237,0.12402],[-0.0430,6.8985,0.12274],[-0.0756,7.2970,0.12204],[-0.1039,7.6422,0.12178],
  [-0.1288,7.9487,0.12181],[-0.1507,8.2254,0.12199],[-0.1700,8.4800,0.12223],[-0.1872,8.7192,0.12247],
  [-0.2024,8.9481,0.12268],[-0.2158,9.1699,0.12283],[-0.2278,9.3870,0.12294],[-0.2384,9.6008,0.12299],
  [-0.2478,9.8124,0.12303],[-0.2562,10.0226,0.12306],[-0.2637,10.2315,0.12309],[-0.2703,10.4393,0.12315],
  [-0.2762,10.6464,0.12323],[-0.2815,10.8534,0.12335],[-0.2862,11.0608,0.12350],[-0.2903,11.2688,0.12369],
  [-0.2941,11.4775,0.12390],[-0.2975,11.6864,0.12414],[-0.3005,11.8947,0.12441],[-0.3032,12.1015,0.12472],
  [-0.3057,12.3059,0.12506],[-0.3080,12.5073,0.12545],[-0.3101,12.7055,0.12587],[-0.3120,12.9006,0.12633],
  [-0.3138,13.0930,0.12683],[-0.3155,13.2837,0.12737],[-0.3171,13.4731,0.12794],[-0.3186,13.6618,0.12855],
  [-0.3201,13.8503,0.12919],[-0.3216,14.0385,0.12988],[-0.3230,14.2265,0.13059],[-0.3243,14.4140,0.13135],
  [-0.3257,14.6010,0.13213],[-0.3270,14.7873,0.13293],[-0.3283,14.9727,0.13376],[-0.3296,15.1573,0.13460],
  [-0.3309,15.3410,0.13545],[-0.3322,15.5240,0.13630],[-0.3335,15.7064,0.13716],[-0.3348,15.8882,0.13800],
  [-0.3361,16.0697,0.13884],[-0.3374,16.2511,0.13968],[-0.3387,16.4322,0.14051],[-0.3400,16.6133,0.14132],
  [-0.3414,16.7942,0.14213],[-0.3427,16.9748,0.14293],[-0.3440,17.1551,0.14371],[-0.3453,17.3347,0.14448],
  [-0.3466,17.5136,0.14525],[-0.3479,17.6916,0.14600],[-0.3492,17.8686,0.14675],[-0.3505,18.0445,0.14748],
  [-0.3518,18.2193,0.14821],
];

// Length-for-age (recumbent, 0-23 months). L=1.
const LFA_BOYS = [
  [49.8842,0.03795],[54.7244,0.03557],[58.4249,0.03424],[61.4292,0.03328],[63.8860,0.03257],
  [65.9026,0.03204],[67.6236,0.03165],[69.1645,0.03139],[70.5994,0.03124],[71.9687,0.03117],
  [73.2812,0.03118],[74.5388,0.03125],[75.7488,0.03137],[76.9186,0.03154],[78.0497,0.03174],
  [79.1458,0.03197],[80.2113,0.03222],[81.2487,0.03250],[82.2587,0.03279],[83.2418,0.03310],
  [84.1996,0.03342],[85.1348,0.03376],[86.0477,0.03410],[86.9410,0.03445],[87.8161,0.03479],
];
const LFA_GIRLS = [
  [49.1477,0.03790],[53.6872,0.03640],[57.0673,0.03568],[59.8029,0.03520],[62.0899,0.03486],
  [64.0301,0.03463],[65.7311,0.03448],[67.2873,0.03441],[68.7498,0.03440],[70.1435,0.03444],
  [71.4818,0.03452],[72.7710,0.03464],[74.0150,0.03479],[75.2176,0.03496],[76.3817,0.03514],
  [77.5099,0.03534],[78.6055,0.03555],[79.6710,0.03576],[80.7079,0.03598],[81.7182,0.03620],
  [82.7036,0.03643],[83.6654,0.03666],[84.6040,0.03688],[85.5202,0.03711],[86.4153,0.03734],
];

// Height-for-age (standing, 24-60 months). L=1.
const HFA_BOYS = [
  [87.1161,0.03507],[87.9720,0.03542],[88.8065,0.03576],[89.6197,0.03610],[90.4120,0.03642],
  [91.1828,0.03674],[91.9327,0.03704],[92.6631,0.03733],[93.3753,0.03761],[94.0711,0.03787],
  [94.7532,0.03812],[95.4236,0.03836],[96.0835,0.03858],[96.7337,0.03879],[97.3749,0.03900],
  [98.0073,0.03919],[98.6310,0.03937],[99.2459,0.03954],[99.8515,0.03971],[100.4485,0.03986],
  [101.0374,0.04002],[101.6186,0.04016],[102.1933,0.04031],[102.7625,0.04045],[103.3273,0.04059],
  [103.8886,0.04073],[104.4473,0.04086],[105.0041,0.04100],[105.5596,0.04113],[106.1138,0.04126],
  [106.6668,0.04139],[107.2188,0.04152],[107.7697,0.04165],[108.3198,0.04177],[108.8689,0.04190],
  [109.4170,0.04202],[109.9638,0.04214],
];
const HFA_GIRLS = [
  [85.7153,0.03764],[86.5904,0.03786],[87.4462,0.03808],[88.2830,0.03830],[89.1004,0.03851],
  [89.8991,0.03872],[90.6797,0.03893],[91.4430,0.03913],[92.1906,0.03933],[92.9239,0.03952],
  [93.6444,0.03971],[94.3533,0.03989],[95.0515,0.04006],[95.7399,0.04024],[96.4187,0.04041],
  [97.0885,0.04057],[97.7493,0.04073],[98.4015,0.04089],[99.0448,0.04105],[99.6795,0.04120],
  [100.3058,0.04135],[100.9238,0.04150],[101.5337,0.04164],[102.1360,0.04179],[102.7312,0.04193],
  [103.3197,0.04206],[103.9021,0.04220],[104.4786,0.04233],[105.0494,0.04246],[105.6148,0.04259],
  [106.1748,0.04272],[106.7295,0.04285],[107.2788,0.04298],[107.8227,0.04310],[108.3613,0.04322],
  [108.8948,0.04334],[109.4233,0.04347],
];

function getLMS(table, ageMonths, startMonth) {
  const idx = Math.min(Math.max(Math.round(ageMonths) - startMonth, 0), table.length - 1);
  return table[idx];
}

function getWfaLMS(sex, age) {
  const t = normalizeSex(sex) === "female" ? WFA_GIRLS : WFA_BOYS;
  return getLMS(t, age, 0);
}

function getHfaLMS(sex, age) {
  const female = normalizeSex(sex) === "female";
  if (age < 24) {
    const [m, s] = getLMS(female ? LFA_GIRLS : LFA_BOYS, age, 0);
    return [1, m, s];
  }
  const [m, s] = getLMS(female ? HFA_GIRLS : HFA_BOYS, age, 24);
  return [1, m, s];
}

function normalizeSex(sex) {
  return String(sex || "").trim().toLowerCase().startsWith("f") ? "female" : "male";
}

// Inverse LMS: given target z-score, compute the measurement
function inverseLMS(z, l, m, s) {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

// Generate weight and height targeting specific WFA and HFA z-scores
function generateMeasurement(sex, ageInMonths, targetWfaZ, targetHfaZ) {
  const [wL, wM, wS] = getWfaLMS(sex, ageInMonths);
  const [hL, hM, hS] = getHfaLMS(sex, ageInMonths);
  const weight = round1(inverseLMS(targetWfaZ, wL, wM, wS));
  const height = round1(inverseLMS(targetHfaZ, hL, hM, hS));
  return { weight: Math.max(2.0, Math.min(25.0, weight)), height: Math.max(40.0, Math.min(120.0, height)) };
}

// Add small random noise to a z-score target (±0.15 SD) for natural variation
function jitter(z, spread = 0.15) {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * spread;
  return Math.max(-4, Math.min(4, z + noise));
}

// --- Classification helper (mirrors nutritionStatus.service.js) ---
function classifyWFA(z) {
  if (z < -3) return "Severely Underweight";
  if (z < -2) return "Underweight";
  if (z > 2) return "Overweight";
  return "Normal";
}
function classifyHFA(z) {
  if (z < -3) return "Severely Stunted";
  if (z < -2) return "Stunted";
  if (z > 2) return "Tall";
  return "Normal";
}

// --- BARANGAY PROFILES ---
// Each profile is an array of { category, wfaZ, hfaZ, fraction } entries.
// wfaZ/hfaZ are the TARGET z-scores for that category (before jitter).
// The WFL/H status will be whatever the WHO tables produce from those measurements.

const PROFILES = {
  // === NORMAL ===
  "normal-clean": [
    { category: "Normal", wfaZ: -0.3, hfaZ: -0.1, fraction: 0.92 },
    { category: "Normal (OW borderline)", wfaZ: 1.5, hfaZ: 0.3, fraction: 0.05 },
    { category: "Normal (UW borderline)", wfaZ: -1.5, hfaZ: -0.3, fraction: 0.03 },
  ],
  "normal-slight": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.88 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.05 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.04 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.03 },
  ],

  // === MEDIUM ===
  "medium-stunting": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.78 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.10 },
    { category: "Severely Stunted", wfaZ: -0.8, hfaZ: -3.2, fraction: 0.03 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.04 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.05 },
  ],
  "medium-underweight": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.80 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.08 },
    { category: "Severely Underweight", wfaZ: -3.2, hfaZ: -0.8, fraction: 0.02 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.05 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.05 },
  ],

  // === HIGH ===
  "high-stunting-wasting": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.62 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.14 },
    { category: "Severely Stunted", wfaZ: -0.8, hfaZ: -3.2, fraction: 0.06 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.05 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.03 },
    { category: "Wasted (low wfh)", wfaZ: -2.5, hfaZ: -0.2, fraction: 0.06 },
    { category: "Severely Wasted", wfaZ: -3.3, hfaZ: -0.3, fraction: 0.04 },
  ],
  "high-underweight-overweight": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.60 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.12 },
    { category: "Severely Underweight", wfaZ: -3.2, hfaZ: -0.8, fraction: 0.05 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.10 },
    { category: "Obese", wfaZ: 3.2, hfaZ: 0.8, fraction: 0.04 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.09 },
  ],

  // === VERY HIGH ===
  "very-high-mixed": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.45 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.15 },
    { category: "Severely Stunted", wfaZ: -0.8, hfaZ: -3.2, fraction: 0.08 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.10 },
    { category: "Severely Underweight", wfaZ: -3.2, hfaZ: -0.8, fraction: 0.05 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.07 },
    { category: "Obese", wfaZ: 3.2, hfaZ: 0.8, fraction: 0.03 },
    { category: "Wasted", wfaZ: -2.5, hfaZ: -0.2, fraction: 0.04 },
    { category: "Tall+Overweight", wfaZ: 2.5, hfaZ: 2.3, fraction: 0.03 },
  ],
  "very-high-stunting": [
    { category: "Normal", wfaZ: -0.2, hfaZ: 0.0, fraction: 0.50 },
    { category: "Stunted", wfaZ: -0.5, hfaZ: -2.3, fraction: 0.18 },
    { category: "Severely Stunted", wfaZ: -0.8, hfaZ: -3.2, fraction: 0.10 },
    { category: "Underweight", wfaZ: -2.3, hfaZ: -0.5, fraction: 0.08 },
    { category: "Overweight", wfaZ: 2.3, hfaZ: 0.5, fraction: 0.06 },
    { category: "Wasted", wfaZ: -2.5, hfaZ: -0.2, fraction: 0.05 },
    { category: "Obese", wfaZ: 3.2, hfaZ: 0.8, fraction: 0.03 },
  ],

  // === NO DATA ===
  "no-data": null,
};

const BARANGAY_ASSIGNMENTS = [
  // Normal (4) — majority
  { name: "Baclaran",       profile: "normal-clean" },
  { name: "Santol",         profile: "normal-slight" },
  { name: "San Juan",       profile: "normal-clean" },
  { name: "Lucban Pook",    profile: "normal-clean" },

  // Medium (2)
  { name: "Calzada",        profile: "medium-stunting" },
  { name: "Caybunga",       profile: "medium-underweight" },

  // High (2)
  { name: "Dalig",          profile: "high-stunting-wasting" },
  { name: "Gumamela",       profile: "high-underweight-overweight" },

  // Very High (2)
  { name: "Duhatan",        profile: "very-high-mixed" },
  { name: "Taludtud",       profile: "very-high-stunting" },

  // No Data (1)
  { name: "Sukol",          profile: "no-data" },

  // Extra normal (1) to ensure majority
  { name: "Munting Tubig",  profile: "normal-slight" },
];

function pickEntry(rand, profile) {
  const r = rand();
  let cum = 0;
  for (const entry of profile) {
    cum += entry.fraction;
    if (r < cum) return entry;
  }
  return profile[profile.length - 1];
}

async function main() {
  console.log(`\n=== Generating varied demo assessments for ${MONTH} ===\n`);

  const { start, end } = toMonthRange(MONTH);
  const dateMeasured = `${MONTH}-10`;

  console.log("Fetching children...");
  const allChildren = await fetchAllPages(() =>
    supabase.from("tbl_children").select("id, name, dob, gender, barangay").eq("status", "active")
  );

  const childrenByBarangay = {};
  for (const c of allChildren) {
    if (!childrenByBarangay[c.barangay]) childrenByBarangay[c.barangay] = [];
    childrenByBarangay[c.barangay].push(c);
  }

  const targetNames = BARANGAY_ASSIGNMENTS.map((a) => a.name);
  const targetChildren = allChildren.filter((c) => targetNames.includes(c.barangay));
  console.log(`  Total children: ${allChildren.length}`);
  console.log(`  Target barangays: ${targetNames.length}\n`);

  // Delete existing Sept assessments for target barangays
  console.log("Deleting existing September assessments for target barangays...");
  const targetIds = targetChildren.map((c) => c.id);
  for (let i = 0; i < targetIds.length; i += 500) {
    const chunk = targetIds.slice(i, i + 500);
    const { error } = await supabase
      .from("tbl_assessments").delete()
      .in("child_id", chunk)
      .gte("date_measured", start)
      .lt("date_measured", end);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }
  console.log("  done.\n");

  // Generate new assessments
  console.log("Generating assessments...\n");
  let totalCreated = 0;
  const results = [];

  for (const assignment of BARANGAY_ASSIGNMENTS) {
    const { name: bName, profile: profileName } = assignment;
    const children = childrenByBarangay[bName] || [];
    if (children.length === 0) {
      console.log(`  ${bName}: NO CHILDREN — skipping`);
      continue;
    }

    if (profileName === "no-data") {
      results.push({ barangay: bName, total: children.length, created: 0, profile: "no-data" });
      console.log(`  ${bName.padEnd(20)} [no-data                 ] ${children.length} children — no assessments`);
      continue;
    }

    const profile = PROFILES[profileName];
    if (!profile) { console.error(`  Unknown profile: ${profileName}`); continue; }

    // Seeded random per barangay for reproducibility
    let seed = 0;
    for (let i = 0; i < bName.length; i++) seed = ((seed << 5) - seed + bName.charCodeAt(i)) | 0;
    function srand() { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }

    const assessments = [];
    for (const child of children) {
      const age = calculateAgeInMonths(child.dob, dateMeasured);
      if (age < 0 || age > 60) continue;

      const entry = pickEntry(srand, profile);
      const targetWfaZ = jitter(entry.wfaZ);
      const targetHfaZ = jitter(entry.hfaZ);
      const { weight, height } = generateMeasurement(child.gender, age, targetWfaZ, targetHfaZ);
      const { wfa_status, hfa_status, wfl_h_status } = classifyNutritionStatus({
        sex: child.gender, ageInMonths: age, weightKg: weight, heightCm: height,
      });

      assessments.push({
        child_id: child.id, date_measured: dateMeasured,
        weight, height, age_in_months: age,
        wfa_status, hfa_status, wfl_h_status,
        submission_status: "submitted",
      });
    }

    for (let i = 0; i < assessments.length; i += 500) {
      const chunk = assessments.slice(i, i + 500);
      const { error } = await supabase.from("tbl_assessments").insert(chunk);
      if (error) throw new Error(`Insert failed for ${bName}: ${error.message}`);
    }
    totalCreated += assessments.length;

    // Stats
    const s = { uw: 0, su: 0, st: 0, ss: 0, wa: 0, sw: 0, ow: 0, ob: 0, n: assessments.length };
    for (const a of assessments) {
      if (a.wfa_status === "Underweight") s.uw++;
      if (a.wfa_status === "Severely Underweight") s.su++;
      if (a.hfa_status === "Stunted") s.st++;
      if (a.hfa_status === "Severely Stunted") s.ss++;
      if (a.wfl_h_status === "Wasted") s.wa++;
      if (a.wfl_h_status === "Severely Wasted") s.sw++;
      if (a.wfl_h_status === "Overweight") s.ow++;
      if (a.wfl_h_status === "Obese") s.ob++;
    }

    const pct = (v) => ((v / s.n) * 100).toFixed(1);
    console.log(
      `  ${bName.padEnd(20)} [${profileName.padEnd(25)}] ${s.n} children | ` +
      `UW:${pct(s.uw)}% SU:${pct(s.su)}% ST:${pct(s.st)}% SS:${pct(s.ss)}% ` +
      `WA:${pct(s.wa)}% SW:${pct(s.sw)}% OW:${pct(s.ow)}% OB:${pct(s.ob)}%`
    );

    results.push({
      barangay: bName, total: s.n, created: assessments.length, profile: profileName,
      uw: s.uw, su: s.su, st: s.st, ss: s.ss, wa: s.wa, sw: s.sw, ow: s.ow, ob: s.ob,
    });
  }

  console.log(`\n  Total assessments created: ${totalCreated}\n`);

  // Summary
  const { worstTier, classifyUnderweight, classifyStunting, classifyWasting, classifyOverweight } =
    require("../src/utils/publicHealthSignificance");

  console.log("=== Severity Summary ===\n");
  const tierCounts = {};
  for (const r of results) {
    if (r.profile === "no-data") {
      tierCounts["no-data"] = (tierCounts["no-data"] || 0) + 1;
      r.severity = "no-data";
      continue;
    }
    const total = r.total;
    const uPct = ((r.uw + r.su) / total) * 100;
    const sPct = ((r.st + r.ss) / total) * 100;
    const wPct = ((r.wa + r.sw) / total) * 100;
    const oPct = ((r.ow + r.ob) / total) * 100;
    const sev = worstTier(
      classifyUnderweight(uPct), classifyStunting(sPct),
      classifyWasting(wPct), classifyOverweight(oPct)
    );
    tierCounts[sev] = (tierCounts[sev] || 0) + 1;
    r.severity = sev;
  }

  for (const tier of ["no-data", "very-low", "low", "medium", "high", "very-high"]) {
    if (tierCounts[tier]) {
      const names = results.filter((r) => r.severity === tier).map((r) => r.barangay);
      console.log(`  ${tier.padEnd(12)} (${tierCounts[tier]}): ${names.join(", ")}`);
    }
  }

  console.log("\n=== Done ===\n");
}

main().catch((err) => {
  console.error("\nScript failed:", err.message);
  process.exit(1);
});
