require("dotenv").config();

// Updates 2026 assessment histories for every configured barangay except Tanggoy.
// Tanggoy's child and assessment data are preserved except for November's
// submission_status, which is set to "draft" (the app's Pending state).
//
// Usage:
//   node scripts/updateAssessmentTrendsAndNovemberStatus.js            # dry-run
//   node scripts/updateAssessmentTrendsAndNovemberStatus.js --apply    # write

const supabase = require("../src/config/supabase");
const barangays = require("../src/data/barangays.json");
const { weightForAgeZ, heightForAgeZ } = require("../src/services/growthReference");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");
const { periodKeyForMonth } = require("../src/utils/date");
const { WEIGHT_RANGE, HEIGHT_RANGE } = require("../src/utils/measurements");
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

const YEAR = "2026";
const EXCLUDED_BARANGAY = "Tanggoy";
const START_DATE = `${YEAR}-01-01`;
const END_DATE = `${YEAR}-12-01`;
const NOVEMBER_START = `${YEAR}-11-01`;
const DECEMBER_START = `${YEAR}-12-01`;
const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 300;
const WRITE_CHUNK_SIZE = 200;
const PERIODS = [`${YEAR}-Q1`, ...Array.from({ length: 8 }, (_, i) => `${YEAR}-${String(i + 4).padStart(2, "0")}`)];
const PERIOD_INDEX = new Map(PERIODS.map((period, index) => [period, index]));

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng, sd = 1) {
  const u1 = rng() || 1e-9;
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function inverseZ(zFn, target, min, max) {
  let low = min;
  let high = max;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (zFn(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function measurementsForZ(gender, age, zW, zH) {
  const weight = inverseZ((value) => weightForAgeZ(gender, age, value), clamp(zW, -4, 4), WEIGHT_RANGE.min, WEIGHT_RANGE.max);
  const height = inverseZ((value) => heightForAgeZ(gender, age, value), clamp(zH, -4, 4), HEIGHT_RANGE.min, HEIGHT_RANGE.max);
  return {
    weight: round1(clamp(weight, WEIGHT_RANGE.min, WEIGHT_RANGE.max)),
    height: round1(clamp(height, HEIGHT_RANGE.min, HEIGHT_RANGE.max)),
  };
}

function nearestBoundary(z, boundaries) {
  let closest = null;
  for (const boundary of boundaries) {
    const distance = Math.abs(z - boundary);
    if (!closest || distance < closest.distance) closest = { boundary, distance };
  }
  return closest;
}

function buildDynamicAxis(seed, zW, zH) {
  const weightBoundary = nearestBoundary(zW, [-3, -2, 2]);
  const heightBoundary = nearestBoundary(zH, [-3, -2, 2]);
  const selector = hashString(`${seed}|axis`);

  if (weightBoundary.distance <= 0.7 && selector % 100 < 40) {
    return { axis: "weight", baseline: zW, boundary: weightBoundary.boundary };
  }
  if (heightBoundary.distance <= 0.7 && Math.floor(selector / 100) % 100 < 40) {
    return { axis: "height", baseline: zH, boundary: heightBoundary.boundary };
  }
  return null;
}

function buildAssessmentUpdates(children, assessments) {
  const childById = new Map(children.map((child) => [child.id, child]));
  const rowsByChild = new Map();
  for (const row of assessments) {
    if (row.status !== "active") continue;
    if (!rowsByChild.has(row.child_id)) rowsByChild.set(row.child_id, []);
    rowsByChild.get(row.child_id).push(row);
  }

  const updates = [];
  let dynamicChildren = 0;
  let changedStatusRows = 0;
  for (const [childId, rows] of rowsByChild) {
    const child = childById.get(childId);
    if (!child) throw new Error("Assessment references a child outside the target set");
    rows.sort((a, b) => String(a.date_measured).localeCompare(String(b.date_measured)) || String(a.id).localeCompare(String(b.id)));

    const novemberRows = rows.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
    if (novemberRows.length !== 1) {
      throw new Error(`Expected one active November assessment for each assessed target child; found ${novemberRows.length}`);
    }
    const anchor = novemberRows[0];
    if (
      !Number.isFinite(Number(anchor.weight)) ||
      !Number.isFinite(Number(anchor.height)) ||
      !Number.isFinite(Number(anchor.age_in_months))
    ) {
      throw new Error("November baseline contains an invalid measurement");
    }

    const baseZW = weightForAgeZ(child.gender, anchor.age_in_months, anchor.weight);
    const baseZH = heightForAgeZ(child.gender, anchor.age_in_months, anchor.height);
    const dynamicAxis = buildDynamicAxis(childId, baseZW, baseZH);
    const childRng = makeRng(hashString(`${childId}|2026-trend`));
    const firstPeriod = Math.min(...rows.map((row) => {
      const period = periodKeyForMonth(String(row.date_measured).slice(0, 7));
      return PERIOD_INDEX.has(period) ? PERIOD_INDEX.get(period) : PERIOD_INDEX.get(`${YEAR}-Q1`);
    }));

    if (dynamicAxis && rows.length > 1) dynamicChildren++;

    for (const row of rows) {
      const month = String(row.date_measured).slice(0, 7);
      if (month < `${YEAR}-01` || month >= `${YEAR}-12`) continue;

      const period = periodKeyForMonth(month);
      const periodIndex = PERIOD_INDEX.get(period);
      if (periodIndex === undefined) continue;

      const age = Number(row.age_in_months);
      if (!Number.isInteger(age) || age < 0 || age > 60) {
        throw new Error(`Invalid stored age in assessment ${row.id}`);
      }

      const progress = periodIndex === firstPeriod || firstPeriod === PERIOD_INDEX.get(`${YEAR}-Q1`)
        ? periodIndex / (PERIODS.length - 1)
        : (periodIndex - firstPeriod) / Math.max(1, PERIODS.length - 1 - firstPeriod);
      const phase = (hashString(`${childId}|phase`) % 1000) / 1000;
      const sharedVariation = 0.045 * Math.sin((progress * 2.5 + phase) * Math.PI);
      let zW = baseZW + sharedVariation + gaussian(childRng, 0.018);
      let zH = baseZH + sharedVariation * 0.55 + gaussian(childRng, 0.018);

      if (dynamicAxis) {
        const oppositeSide = dynamicAxis.baseline < dynamicAxis.boundary
          ? dynamicAxis.boundary + 0.16
          : dynamicAxis.boundary - 0.16;
        const trajectoryZ = oppositeSide + (dynamicAxis.baseline - oppositeSide) * progress;
        if (dynamicAxis.axis === "weight") zW = trajectoryZ + gaussian(childRng, 0.018);
        else zH = trajectoryZ + gaussian(childRng, 0.018);
      }

      const measurements = measurementsForZ(child.gender, age, zW, zH);
      const statuses = classifyNutritionStatus({
        sex: child.gender,
        ageInMonths: age,
        weightKg: measurements.weight,
        heightCm: measurements.height,
      });

      if (
        row.wfa_status !== statuses.wfa_status ||
        row.hfa_status !== statuses.hfa_status ||
        row.wfl_h_status !== statuses.wfl_h_status
      ) {
        changedStatusRows++;
      }
      updates.push({
        id: row.id,
        child_id: row.child_id,
        date_measured: row.date_measured,
        weight: measurements.weight,
        height: measurements.height,
        age_in_months: age,
        ...statuses,
        submission_status: month.startsWith(`${YEAR}-11`) ? "submitted" : row.submission_status,
      });
    }
  }

  return { updates, dynamicChildren, changedStatusRows };
}

function trendCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const period = periodKeyForMonth(String(row.date_measured).slice(0, 7));
    if (!PERIOD_INDEX.has(period)) continue;
    if (!counts.has(period)) counts.set(period, { wfa: {}, hfa: {}, wfl_h: {} });
    const bucket = counts.get(period);
    for (const [key, value] of [
      ["wfa", row.wfa_status],
      ["hfa", row.hfa_status],
      ["wfl_h", row.wfl_h_status],
    ]) {
      bucket[key][value] = (bucket[key][value] || 0) + 1;
    }
  }
  return counts;
}

function summarizeMapRisk(children, novemberRows) {
  const childById = new Map(children.map((child) => [child.id, child]));
  const totals = new Map();
  for (const row of novemberRows) {
    if ((row.status && row.status !== "active") || row.submission_status !== "submitted") continue;
    const name = childById.get(row.child_id)?.barangay;
    if (!name) continue;
    if (!totals.has(name)) totals.set(name, { total: 0, underweight: 0, stunted: 0, wasted: 0, overweight: 0 });
    const bucket = totals.get(name);
    bucket.total++;
    if (["Underweight", "Severely Underweight"].includes(row.wfa_status)) bucket.underweight++;
    if (["Stunted", "Severely Stunted"].includes(row.hfa_status)) bucket.stunted++;
    if (["Wasted", "Severely Wasted"].includes(row.wfl_h_status)) bucket.wasted++;
    if (["Overweight", "Obese"].includes(row.wfl_h_status)) bucket.overweight++;
  }

  const distribution = {};
  for (const bucket of totals.values()) {
    if (!bucket.total) continue;
    const pct = (count) => (count / bucket.total) * 100;
    const severity = worstTier(
      classifyUnderweight(pct(bucket.underweight)),
      classifyStunting(pct(bucket.stunted)),
      classifyWasting(pct(bucket.wasted)),
      classifyOverweight(pct(bucket.overweight))
    );
    distribution[severity] = (distribution[severity] || 0) + 1;
  }
  return distribution;
}

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Database read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchAssessments(childIds) {
  const rows = [];
  for (let i = 0; i < childIds.length; i += ID_CHUNK_SIZE) {
    const ids = childIds.slice(i, i + ID_CHUNK_SIZE);
    rows.push(...await fetchAllPages(() =>
      supabase
        .from("tbl_assessments")
        .select("id,child_id,date_measured,weight,height,age_in_months,wfa_status,hfa_status,wfl_h_status,submission_status,status")
        .in("child_id", ids)
        .gte("date_measured", START_DATE)
        .lt("date_measured", END_DATE)
        .order("date_measured", { ascending: true })
        .order("id", { ascending: true })
    ));
  }
  return rows;
}

async function upsertChunked(rows) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("tbl_assessments")
      .upsert(chunk, { onConflict: "id" })
      .select("id");
    if (error) throw new Error(`Failed to update assessment history: ${error.message}`);
    if ((data || []).length !== chunk.length) {
      throw new Error(`Assessment update returned ${data?.length || 0} rows; expected ${chunk.length}`);
    }
  }
}

async function updateSubmissionStatus(rows, status) {
  let updated = 0;
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const ids = rows.slice(i, i + WRITE_CHUNK_SIZE).map((row) => row.id);
    const { data, error } = await supabase
      .from("tbl_assessments")
      .update({ submission_status: status })
      .in("id", ids)
      .select("id");
    if (error) throw new Error(`Failed to set November status to ${status}: ${error.message}`);
    updated += (data || []).length;
  }
  if (updated !== rows.length) throw new Error(`Status update touched ${updated} rows; expected ${rows.length}`);
  return updated;
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.argv.includes("--dry-run")) {
    throw new Error("Choose either --dry-run or --apply, not both");
  }

  const names = barangays.map((barangay) => barangay.name);
  if (!names.includes(EXCLUDED_BARANGAY)) throw new Error(`${EXCLUDED_BARANGAY} is missing from barangays.json`);
  const targetNames = names.filter((name) => name !== EXCLUDED_BARANGAY);
  const allowedNames = new Set(names);

  console.log(`\n=== Assessment history update (${apply ? "APPLY" : "DRY-RUN"}) ===`);
  console.log(`Period: ${YEAR} Q1-November | excluded from measurements: ${EXCLUDED_BARANGAY}`);

  const children = await fetchAllPages(() =>
    supabase.from("tbl_children").select("id,barangay,gender,dob")
  );
  const unexpected = children.filter((child) => !allowedNames.has(child.barangay));
  if (unexpected.length) {
    throw new Error(`${unexpected.length} child record(s) have an unconfigured barangay; refusing to update`);
  }

  const targetChildren = children.filter((child) => targetNames.includes(child.barangay));
  const tanggoyChildren = children.filter((child) => child.barangay === EXCLUDED_BARANGAY);
  const targetIds = targetChildren.map((child) => child.id);
  const tanggoyIds = tanggoyChildren.map((child) => child.id);
  if (new Set(targetIds).size !== targetIds.length) throw new Error("Duplicate target child IDs returned");
  const tanggoyIdSet = new Set(tanggoyIds);
  if (targetIds.some((id) => tanggoyIdSet.has(id))) throw new Error("Tanggoy child ID entered the target set");

  const [targetAssessments, tanggoyAssessments] = await Promise.all([
    fetchAssessments(targetIds),
    fetchAssessments(tanggoyIds),
  ]);
  const activeTarget = targetAssessments.filter((row) => row.status === "active");
  const updates = buildAssessmentUpdates(targetChildren, activeTarget);
  const targetNovember = targetAssessments.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  const targetNovemberNotSubmitted = targetNovember.filter((row) => row.submission_status !== "submitted");
  const tanggoyNovember = tanggoyAssessments.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  const tanggoyNovemberNotDraft = tanggoyNovember.filter((row) => row.submission_status !== "draft");

  const activeTargetById = new Map(activeTarget.map((row) => [row.id, row]));
  const chartRows = updates.updates.filter((row) => {
    const original = activeTargetById.get(row.id);
    return original?.submission_status === "submitted" || row.submission_status === "submitted";
  });
  const periods = trendCounts(chartRows);
  const visiblePeriods = [...periods.entries()].sort(([a], [b]) => PERIOD_INDEX.get(a) - PERIOD_INDEX.get(b));
  const hasDynamicTrend = ["wfa", "hfa", "wfl_h"].some((indicator) => {
    const statuses = new Set(visiblePeriods.flatMap(([, counts]) => Object.keys(counts[indicator])));
    return statuses.size > 1 && visiblePeriods.some(([, counts]) =>
      Object.keys(counts[indicator]).some((status) => {
        const values = visiblePeriods.map(([, periodCounts]) => periodCounts[indicator][status] || 0);
        return new Set(values).size > 1;
      })
    );
  });
  if (!updates.updates.length) throw new Error("No active 2026 target assessments found; refusing to proceed");
  if (!hasDynamicTrend) throw new Error("Generated assessment history does not change trend counts; refusing to proceed");

  const novemberActiveTarget = activeTarget.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  const activeTargetChildIds = new Set(activeTarget.map((row) => row.child_id));
  const activeTargetNovemberIds = new Set(novemberActiveTarget.map((row) => row.child_id));
  const missingNovember = [...activeTargetChildIds].filter((id) => !activeTargetNovemberIds.has(id));
  if (missingNovember.length) {
    throw new Error(`${missingNovember.length} assessed target child(ren) have no active November record; refusing to claim full coverage`);
  }

  console.log(`Target children: ${targetChildren.length} | Tanggoy children (records preserved): ${tanggoyChildren.length}`);
  console.log(`Active historical assessment rows to update: ${updates.updates.length}`);
  console.log(`November target rows to mark submitted: ${targetNovemberNotSubmitted.length}/${targetNovember.length}`);
  console.log(`November Tanggoy rows to mark pending (draft): ${tanggoyNovemberNotDraft.length}/${tanggoyNovember.length}`);
  console.log(`Children with threshold-adjacent recovery/decline trajectories: ${updates.dynamicChildren}`);
  console.log(`Assessment rows whose nutrition category changes: ${updates.changedStatusRows}`);
  const generatedNovember = updates.updates.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  console.log(`Natural November map risk distribution: ${JSON.stringify(summarizeMapRisk(targetChildren, generatedNovember))}`);
  console.log("Generated submitted-trend counts by period:");
  for (const [period, counts] of visiblePeriods) {
    console.log(`  ${period}: WFA ${JSON.stringify(counts.wfa)} | HFA ${JSON.stringify(counts.hfa)} | WFL/H ${JSON.stringify(counts.wfl_h)}`);
  }

  if (!apply) {
    console.log("\nDry-run complete. No database rows were changed.");
    return;
  }

  await upsertChunked(updates.updates);
  await updateSubmissionStatus(targetNovemberNotSubmitted, "submitted");
  await updateSubmissionStatus(tanggoyNovemberNotDraft, "draft");

  const redis = require("../src/config/redis");
  await redis.bustAll(["reports:*", "assessments:*", "shared:trends:*"]);
  await redis.touchRevs(Array.from({ length: 11 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`));

  const [targetAfter, tanggoyAfter] = await Promise.all([
    fetchAssessments(targetIds),
    fetchAssessments(tanggoyIds),
  ]);
  const targetNovemberAfter = targetAfter.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  const tanggoyNovemberAfter = tanggoyAfter.filter((row) => String(row.date_measured).startsWith(`${YEAR}-11`));
  const targetNotSubmitted = targetNovemberAfter.filter((row) => row.submission_status !== "submitted");
  const tanggoyNotDraft = tanggoyNovemberAfter.filter((row) => row.submission_status !== "draft");
  const targetIdsAfter = new Set(targetAfter.map((row) => row.id));
  const originalTargetIds = new Set(targetAssessments.map((row) => row.id));
  const targetRowsChanged = targetIdsAfter.size !== originalTargetIds.size ||
    [...originalTargetIds].some((id) => !targetIdsAfter.has(id));
  const tanggoyIdsAfter = new Set(tanggoyAfter.map((row) => row.id));
  const originalTanggoyIds = new Set(tanggoyAssessments.map((row) => row.id));
  const tanggoyRowsChanged = tanggoyIdsAfter.size !== originalTanggoyIds.size ||
    [...originalTanggoyIds].some((id) => !tanggoyIdsAfter.has(id));

  console.log("\n=== Verification ===");
  console.log(`Target November submitted: ${targetNovemberAfter.length - targetNotSubmitted.length}/${targetNovemberAfter.length}`);
  console.log(`Tanggoy November pending: ${tanggoyNovemberAfter.length - tanggoyNotDraft.length}/${tanggoyNovemberAfter.length}`);
  console.log(`Target assessment row count unchanged: ${!targetRowsChanged}`);
  console.log(`Tanggoy assessment rows preserved: ${!tanggoyRowsChanged}`);

  if (targetNotSubmitted.length || tanggoyNotDraft.length || targetRowsChanged || tanggoyRowsChanged) {
    throw new Error("Post-update verification failed");
  }
}

main()
  .catch((error) => {
    console.error("\nAssessment update failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode || 0);
  });
