require("dotenv").config();

// Seeds Jan-Apr assessment history so the admin Health Trends line chart
// (January-December view) has data to render.
//
// Distribution: bulk (~85%) Normal across all three indicators, plus
// guaranteed examples of every other status each month:
//   WFA: Underweight, Severely Underweight, Overweight
//   HFA: Stunted, Severely Stunted, Tall
//   WFL/H: Wasted, Severely Wasted, Overweight, Obese
//
// Measurements are derived from target WHO z-scores through the same LMS
// tables the app classifies with, then verified with the real
// classifyNutritionStatus() before insert — so weight/height and the stored
// statuses always agree.
//
// Usage:
//   node scripts/seedJanAprAssessments.js [year] [--replace] [--dry-run]
//   - year defaults to the current Manila year (matches the chart default).
//   - default mode skips child-month pairs that already have an assessment.
//   - --replace deletes existing Jan-Apr assessments first (idempotent reseed).
//   - --dry-run generates everything but inserts nothing.

const supabase = require("../src/config/supabase");
const { weightForAgeZ, heightForAgeZ } = require("../src/services/growthReference");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const { calculateAgeInMonths, todayInManila, toMonthRange, periodKeyForMonth } = require("../src/utils/date");
const { WEIGHT_RANGE, HEIGHT_RANGE } = require("../src/utils/measurements");
const { bustAll, touchRevs } = require("../src/config/redis");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
const MAX_ATTEMPTS = 25;

const NORMAL_TARGET = { wfaZ: -0.2, hfaZ: 0.0 };

// One entry per non-Normal status the chart must render a line for.
const EDGE_TARGETS = [
  { key: "Underweight", wfaZ: -2.4, hfaZ: -0.4, wantCol: "wfa_status", want: "Underweight" },
  { key: "Severely Underweight", wfaZ: -3.3, hfaZ: -0.6, wantCol: "wfa_status", want: "Severely Underweight" },
  { key: "Overweight (WFA)", wfaZ: 2.4, hfaZ: 0.6, wantCol: "wfa_status", want: "Overweight" },
  { key: "Stunted", wfaZ: -0.4, hfaZ: -2.4, wantCol: "hfa_status", want: "Stunted" },
  { key: "Severely Stunted", wfaZ: -0.6, hfaZ: -3.3, wantCol: "hfa_status", want: "Severely Stunted" },
  { key: "Tall", wfaZ: 0.8, hfaZ: 2.4, wantCol: "hfa_status", want: "Tall" },
  { key: "Wasted", wfaZ: -2.2, hfaZ: 0.1, wantCol: "wfl_h_status", want: "Wasted" },
  { key: "Severely Wasted", wfaZ: -3.4, hfaZ: -0.1, wantCol: "wfl_h_status", want: "Severely Wasted" },
  { key: "Overweight (WFL)", wfaZ: 2.8, hfaZ: 0.2, wantCol: "wfl_h_status", want: "Overweight" },
  { key: "Obese", wfaZ: 3.5, hfaZ: 0.3, wantCol: "wfl_h_status", want: "Obese" },
];

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

// Bisection inverse of a monotonically-increasing z-score function (same
// approach as scripts/resetAndSeed.js).
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

// Build one assessment row, retrying with fresh jitter until the desired
// classification holds (or attempts run out — then keep best effort).
function buildRow(child, dateMeasured, age, target) {
  let fallback = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const zW = clamp(target.wfaZ + gaussian(0, 0.12), -4, 4);
    const zH = clamp(target.hfaZ + gaussian(0, 0.12), -4, 4);
    const { weight, height } = measurementsForZ(child.gender, age, zW, zH);
    const statuses = classifyNutritionStatus({
      sex: child.gender,
      ageInMonths: age,
      weightKg: weight,
      heightCm: height,
    });
    const row = {
      child_id: child.id,
      date_measured: dateMeasured,
      weight,
      height,
      age_in_months: age,
      ...statuses,
      submission_status: "submitted",
      status: "active",
    };
    if (!target.wantCol) {
      if (statuses.wfa_status === "Normal" && statuses.hfa_status === "Normal" && statuses.wfl_h_status === "Normal") {
        return { row, ok: true };
      }
    } else if (statuses[target.wantCol] === target.want) {
      return { row, ok: true };
    }
    fallback = row;
  }
  return { row: fallback, ok: false };
}

async function fetchAllChildren() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tbl_children")
      .select("id, dob, gender")
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch children: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchExistingPairs(rangeStart, rangeEnd) {
  const pairs = new Set();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tbl_assessments")
      .select("child_id, date_measured")
      .eq("status", "active")
      .gte("date_measured", rangeStart)
      .lt("date_measured", rangeEnd)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch existing assessments: ${error.message}`);
    // Q1-aware: Jan/Feb/Mar of one year share a single "YYYY-Q1" key, since
    // only one assessment per child exists for that quarter.
    for (const r of data) pairs.add(`${r.child_id}|${periodKeyForMonth(String(r.date_measured).slice(0, 7))}`);
    if (data.length < PAGE_SIZE) break;
  }
  return pairs;
}

// Deterministic per-month shuffle so reseeds are reproducible.
function shuffled(arr, seedStr) {
  const out = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = ((seed << 5) - seed + seedStr.charCodeAt(i)) | 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const yearArg = args.find((a) => /^\d{4}$/.test(a));
  const year = yearArg || todayInManila().slice(0, 4);
  const replace = args.includes("--replace");
  const dryRun = args.includes("--dry-run");
  const months = [`${year}-01`, `${year}-02`, `${year}-03`, `${year}-04`];

  console.log(`\n=== Seed Jan-Apr assessment history (${months[0]}..${months[months.length - 1]}) ===`);
  console.log(`mode: ${dryRun ? "DRY-RUN (no inserts)" : replace ? "replace (delete existing first)" : "insert, skip existing"}\n`);

  console.log("Fetching active children...");
  const children = await fetchAllChildren();
  console.log(`  ${children.length} active children.\n`);

  const rangeStart = toMonthRange(months[0]).start;
  const rangeEnd = toMonthRange(months[months.length - 1]).end;

  if (replace && !dryRun) {
    console.log("Deleting existing Jan-Apr assessments...");
    const { error } = await supabase
      .from("tbl_assessments")
      .delete()
      .gte("date_measured", rangeStart)
      .lt("date_measured", rangeEnd);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    console.log("  done.\n");
  }

  console.log("Fetching existing child-month pairs...");
  const existing = replace ? new Set() : await fetchExistingPairs(rangeStart, rangeEnd);
  console.log(`  ${existing.size} existing assessment(s) in range (will be skipped).\n`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalMisfires = 0;
  const coverageProblems = [];

  for (const month of months) {
    const dateMeasured = `${month}-10`;
    // Q1-aware: Jan/Feb/Mar share one assessment window, so Feb/Mar are
    // skipped once the quarter already has a row (existing or seeded as Jan).
    const period = periodKeyForMonth(month);
    const eligible = [];
    for (const child of children) {
      if (!child.dob || !child.gender) continue;
      // Skip children not born yet at this measurement date (calculateAgeInMonths
      // clamps negatives to 0, so compare calendar dates directly).
      if (child.dob > dateMeasured) continue;
      const age = calculateAgeInMonths(child.dob, dateMeasured);
      if (age < 0 || age > 60) continue;
      if (existing.has(`${child.id}|${period}`)) {
        totalSkipped += 1;
        continue;
      }
      eligible.push({ ...child, _age: age });
    }

    // ~1.5% of eligible children per edge status (3..15 each) — the rest Normal.
    const perEdge = clamp(Math.round(eligible.length * 0.015), 3, 15);
    const order = shuffled(eligible, `seed-${month}`);
    const edgePool = order.slice(0, perEdge * EDGE_TARGETS.length);
    const normalPool = order.slice(perEdge * EDGE_TARGETS.length);

    const rows = [];
    let misfires = 0;
    const tally = { wfa: {}, hfa: {}, wfl_h: {} };

    const pushRow = (built) => {
      if (!built.ok) misfires += 1;
      rows.push(built.row);
      tally.wfa[built.row.wfa_status] = (tally.wfa[built.row.wfa_status] || 0) + 1;
      tally.hfa[built.row.hfa_status] = (tally.hfa[built.row.hfa_status] || 0) + 1;
      tally.wfl_h[built.row.wfl_h_status] = (tally.wfl_h[built.row.wfl_h_status] || 0) + 1;
    };

    edgePool.forEach((child, i) => {
      const target = EDGE_TARGETS[i % EDGE_TARGETS.length];
      pushRow(buildRow(child, dateMeasured, child._age, target));
    });
    for (const child of normalPool) {
      pushRow(buildRow(child, dateMeasured, child._age, NORMAL_TARGET));
    }

    const normalTriple = rows.filter(
      (r) => r.wfa_status === "Normal" && r.hfa_status === "Normal" && r.wfl_h_status === "Normal"
    ).length;

    console.log(
      `  ${month}: eligible=${eligible.length} normal-pool=${normalPool.length} ` +
        `edge-pool=${edgePool.length} (${perEdge}/status) all-Normal=${normalTriple} ` +
        `(${((normalTriple / Math.max(1, rows.length)) * 100).toFixed(1)}%) misfires=${misfires}`
    );
    console.log(`    WFA: ${JSON.stringify(tally.wfa)}`);
    console.log(`    HFA: ${JSON.stringify(tally.hfa)}`);
    console.log(`    WFL: ${JSON.stringify(tally.wfl_h)}`);

    // Coverage is per assessment period: Feb/Mar intentionally seed 0 rows
    // once Q1 (Jan) is filled, since the chart groups them into one point.
    if (rows.length > 0) {
      const required = [
        ["wfa", ["Normal", "Underweight", "Severely Underweight", "Overweight"]],
        ["hfa", ["Normal", "Stunted", "Severely Stunted", "Tall"]],
        ["wfl_h", ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"]],
      ];
      for (const [key, statuses] of required) {
        for (const s of statuses) {
          if (!tally[key][s]) coverageProblems.push(`${month}: ${key}.${s} has 0 rows`);
        }
      }
    } else {
      console.log(`    (skipped — ${period} already seeded; Jan–Mar is one assessment window)`);
    }

    if (!dryRun && rows.length) {
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase.from("tbl_assessments").insert(chunk);
        if (error) throw new Error(`Insert failed for ${month}: ${error.message}`);
      }
      totalInserted += rows.length;
      totalMisfires += misfires;
      for (const r of rows) existing.add(`${r.child_id}|${periodKeyForMonth(month)}`);
    } else if (dryRun) {
      totalMisfires += misfires;
      // Dry-run still marks the period as seeded so Feb/Mar preview the same
      // Q1-dedupe the real run will apply.
      for (const r of rows) existing.add(`${r.child_id}|${periodKeyForMonth(month)}`);
    }

    process.stdout.write("\n");
  }

  if (!dryRun && totalInserted > 0) {
    await bustAll(["reports:*", "assessments:*", "children:*"]);
    await touchRevs(months);
    console.log("Cache busted + revision counters bumped for:", months.join(", "));
  }

  console.log("\n=== Done ===");
  console.log(`  inserted: ${totalInserted} | skipped (already existed): ${totalSkipped} | misfires: ${totalMisfires}`);
  if (coverageProblems.length) {
    console.log("\nCOVERAGE GAPS (chart lines that would render flat/missing):");
    for (const p of coverageProblems) console.log(`  ! ${p}`);
    process.exitCode = 1;
  } else {
    console.log("Coverage OK: every WFA/HFA/WFL status has >0 rows in Jan–Mar (Q1) and Apr.");
  }
  console.log("");
  // Redis connects eagerly on import and keeps the event loop alive —
  // exit explicitly (existing scripts avoid this by not importing redis).
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error("\nSeed script failed:", err.message);
  process.exit(1);
});
