require("dotenv").config();

const supabase = require("../src/config/supabase");
const { calculateAgeInMonths, todayInManila, toMonthRange } = require("../src/utils/date");
const { classifyNutritionStatus } = require("../src/services/nutritionStatus.service");

const MONTH = process.argv[2] || todayInManila().slice(0, 7); // defaults to current month
const PAGE_SIZE = 1000;

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

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

function round1(x) {
  return Math.round(x * 10) / 10;
}

function generateMeasurement(gender, ageInMonths) {
  // WHO-based typical weight/height ranges by age, with slight randomness
  const weightTable = {
    Male:   [[0,3.5],[1,4.5],[2,5.5],[3,6.5],[4,7.2],[5,7.8],[6,8.3],[7,8.7],[8,9.1],[9,9.4],[10,9.7],[11,10.0],[12,10.3],[15,10.9],[18,11.5],[21,12.1],[24,12.6],[30,13.6],[36,14.5],[42,15.3],[48,16.1],[54,16.9],[60,17.6]],
    Female: [[0,3.3],[1,4.2],[2,5.1],[3,5.9],[4,6.5],[5,7.0],[6,7.4],[7,7.8],[8,8.1],[9,8.4],[10,8.7],[11,9.0],[12,9.2],[15,9.8],[18,10.4],[21,10.9],[24,11.5],[30,12.5],[36,13.4],[42,14.2],[48,15.0],[54,15.8],[60,16.5]],
  };
  const heightTable = {
    Male:   [[0,49.5],[1,53.0],[2,56.0],[3,58.5],[4,60.5],[5,62.3],[6,64.0],[7,65.5],[8,67.0],[9,68.3],[10,69.6],[11,70.8],[12,72.0],[15,75.0],[18,78.0],[21,80.5],[24,83.0],[30,87.5],[36,92.0],[42,96.0],[48,99.5],[54,103.0],[60,106.0]],
    Female: [[0,49.0],[1,52.5],[2,55.5],[3,57.8],[4,59.8],[5,61.5],[6,63.0],[7,64.5],[8,66.0],[9,67.3],[10,68.5],[11,69.7],[12,71.0],[15,74.0],[18,77.0],[21,79.5],[24,82.0],[30,86.5],[36,90.5],[42,94.5],[48,98.0],[54,101.5],[60,105.0]],
  };

  function lerp(table, age) {
    if (age <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (age <= table[i][0]) {
        const t = (age - table[i - 1][0]) / (table[i][0] - table[i - 1][0]);
        return table[i - 1][1] + t * (table[i][1] - table[i - 1][1]);
      }
    }
    return table[table.length - 1][1];
  }

  const baseWeight = lerp(weightTable[gender] || weightTable.Male, ageInMonths);
  const baseHeight = lerp(heightTable[gender] || heightTable.Male, ageInMonths);
  const weight = round1(baseWeight * (0.9 + Math.random() * 0.2)); // +/- 10%
  const height = round1(baseHeight * (0.95 + Math.random() * 0.1)); // +/- 5%
  return { weight, height };
}

async function main() {
  console.log(`\n=== Ensure all children assessed & submitted for ${MONTH} ===\n`);

  const { start, end } = toMonthRange(MONTH);
  const dateMeasured = `${MONTH}-05`; // mid-month measurement date

  // 1. Fetch all active children
  console.log("Fetching active children...");
  const children = await fetchAllPages(() =>
    supabase.from("tbl_children").select("id, name, dob, gender").eq("status", "active")
  );
  console.log(`  Found ${children.length} active children.\n`);

  // 2. Fetch existing assessments for this month
  console.log(`Fetching existing assessments for ${MONTH}...`);
  const existing = await fetchAllPages(() =>
    supabase
      .from("tbl_assessments")
      .select("id, child_id, submission_status")
      .gte("date_measured", start)
      .lt("date_measured", end)
      .eq("status", "active")
  );

  const assessedChildIds = new Set(existing.map((a) => a.child_id));
  const unassessed = children.filter((c) => !assessedChildIds.has(c.id));
  console.log(`  ${existing.length} assessments already exist for ${MONTH}.`);
  console.log(`  ${unassessed.length} children need an assessment.\n`);

  // 3. Create assessments for unassessed children
  let created = 0;
  if (unassessed.length > 0) {
    console.log("Creating missing assessments...");
    const newAssessments = [];
    for (const child of unassessed) {
      const ageInMonths = calculateAgeInMonths(child.dob, dateMeasured);
      if (ageInMonths < 0 || ageInMonths > 60) continue;

      const { weight, height } = generateMeasurement(child.gender, ageInMonths);
      const { wfa_status, hfa_status, wfl_h_status } = classifyNutritionStatus({
        sex: child.gender,
        ageInMonths,
        weightKg: weight,
        heightCm: height,
      });

      newAssessments.push({
        child_id: child.id,
        date_measured: dateMeasured,
        weight,
        height,
        age_in_months: ageInMonths,
        wfa_status,
        hfa_status,
        wfl_h_status,
        submission_status: "draft", // will be submitted in next step
      });
    }

    if (newAssessments.length > 0) {
      // Insert in chunks of 500
      for (let i = 0; i < newAssessments.length; i += 500) {
        const chunk = newAssessments.slice(i, i + 500);
        const { error: insertErr } = await supabase.from("tbl_assessments").insert(chunk);
        if (insertErr) throw new Error(`Failed to insert assessments: ${insertErr.message}`);
      }
      created = newAssessments.length;
      console.log(`  Created ${created} new assessments.\n`);
    }
  }

  // 4. Submit all drafts for this month
  console.log("Submitting all draft assessments for this month...");
  const { data: submitted, error: submitErr } = await supabase
    .from("tbl_assessments")
    .update({ submission_status: "submitted" })
    .gte("date_measured", start)
    .lt("date_measured", end)
    .eq("submission_status", "draft")
    .eq("status", "active")
    .select("id");
  if (submitErr) throw new Error(`Failed to submit assessments: ${submitErr.message}`);
  console.log(`  Submitted ${submitted.length} draft assessments.\n`);

  // 5. Verify
  const { count: totalSubmitted } = await supabase
    .from("tbl_assessments")
    .select("id", { count: "exact", head: true })
    .gte("date_measured", start)
    .lt("date_measured", end)
    .eq("submission_status", "submitted")
    .eq("status", "active");

  console.log("=== Done ===");
  console.log(`  Total children: ${children.length}`);
  console.log(`  Assessments created: ${created}`);
  console.log(`  Assessments submitted: ${submitted.length}`);
  console.log(`  Total submitted for ${MONTH}: ${totalSubmitted}`);
  console.log("");
}

main().catch((err) => {
  console.error("\nScript failed:", err.message);
  process.exit(1);
});
