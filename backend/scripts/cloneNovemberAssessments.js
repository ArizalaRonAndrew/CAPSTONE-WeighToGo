require("dotenv").config();

// Clones October assessment rows into November for Barangay 1-12 (Poblacion),
// then explicitly flips those November rows to submission_status = 'submitted'.
//
// Usage:
//   node scripts/cloneNovemberAssessments.js            # dry-run (no writes)
//   node scripts/cloneNovemberAssessments.js --apply    # insert + submit
//
// Idempotent: children that already have a November row are skipped (and, for
// an --apply run, that existing row is still explicitly marked submitted).

const supabase = require("../src/config/supabase");
const { bustAll, touchRevs } = require("../src/config/redis");

const SOURCE_MONTH = "2026-10";
const TARGET_MONTH = "2026-11";
const TARGET_DATE = "2026-11-05";
const TARGET_BARANGAY = /^Barangay (1[0-2]|[1-9]) \(Poblacion\)$/;
const CHUNK = 100;
const INSERT_CHUNK = 400;
const PAGE = 1000;
const APPLY = process.argv.includes("--apply");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

function monthRange(month) {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
  return { start, end };
}

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchAllChildren() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tbl_children")
      .select("id,name,barangay,status,dob,gender")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to fetch children: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Fetch assessments for an explicit child-id set. Matching on child_id keeps
// each request well under the row cap, so no unstable date-only pagination.
async function fetchAssessmentsForChildren(childIds, month) {
  const { start, end } = monthRange(month);
  const rows = [];
  for (const ids of chunks(childIds, CHUNK)) {
    const { data, error } = await supabase
      .from("tbl_assessments")
      .select(
        "id,child_id,date_measured,weight,height,age_in_months,wfa_status,hfa_status,wfl_h_status,submission_status,status"
      )
      .in("child_id", ids)
      .gte("date_measured", start)
      .lt("date_measured", end)
      .order("id", { ascending: true });
    if (error) throw new Error(`Failed to fetch ${month} assessments: ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

async function main() {
  console.log(`\n=== Clone ${SOURCE_MONTH} -> ${TARGET_MONTH} for Barangay 1-12 (Poblacion) ===`);
  console.log(`mode: ${APPLY ? "APPLY (writes to database)" : "DRY-RUN (no writes)"}`);
  console.log(`target date_measured: ${TARGET_DATE}\n`);

  const children = await fetchAllChildren();
  const targets = children.filter((c) => c.status === "active" && TARGET_BARANGAY.test(c.barangay));
  const targetIds = targets.map((c) => c.id);
  console.log(`Active target children: ${targets.length} across ${new Set(targets.map((c) => c.barangay)).size} barangays.`);

  const october = await fetchAssessmentsForChildren(targetIds, SOURCE_MONTH);
  const november = await fetchAssessmentsForChildren(targetIds, TARGET_MONTH);
  console.log(`${SOURCE_MONTH} source rows: ${october.length}`);
  console.log(`${TARGET_MONTH} existing rows: ${november.length}\n`);

  // One source row per child. If a child somehow has more than one October
  // row, keep the earliest (date, then id) — the same rule the reports use.
  const sourceByChild = new Map();
  for (const row of october) {
    if (!sourceByChild.has(row.child_id)) sourceByChild.set(row.child_id, []);
    sourceByChild.get(row.child_id).push(row);
  }
  const sourceRow = new Map();
  for (const [childId, rows] of sourceByChild) {
    rows.sort((a, b) =>
      String(a.date_measured).localeCompare(String(b.date_measured)) || String(a.id).localeCompare(String(b.id))
    );
    sourceRow.set(childId, rows[0]);
  }

  const existingByChild = new Map();
  for (const row of november) existingByChild.set(row.child_id, row);

  const toInsert = [];
  const skippedExisting = [];
  const skippedNoSource = [];
  for (const child of targets) {
    if (existingByChild.has(child.id)) {
      skippedExisting.push(child);
      continue;
    }
    const src = sourceRow.get(child.id);
    if (!src) {
      skippedNoSource.push(child);
      continue;
    }
    toInsert.push({
      child_id: child.id,
      date_measured: TARGET_DATE,
      weight: src.weight,
      height: src.height,
      age_in_months: src.age_in_months,
      wfa_status: src.wfa_status,
      hfa_status: src.hfa_status,
      wfl_h_status: src.wfl_h_status,
      submission_status: "draft",
      status: "active",
    });
  }

  const perBarangay = {};
  for (const row of toInsert) {
    const b = targets.find((c) => c.id === row.child_id).barangay;
    perBarangay[b] = (perBarangay[b] || 0) + 1;
  }
  console.log("Rows to insert (draft), by barangay:");
  for (const b of [...new Set(targets.map((c) => c.barangay))].sort(
    (a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])
  )) {
    console.log(`  ${b.padEnd(26)} ${String(perBarangay[b] || 0).padStart(4)}`);
  }
  console.log(`\n  total to insert: ${toInsert.length}`);
  console.log(`  already had a ${TARGET_MONTH} row (kept, will be submitted): ${skippedExisting.length}`);
  console.log(`  no ${SOURCE_MONTH} source row (skipped): ${skippedNoSource.length}`);
  for (const c of skippedNoSource) console.log(`    - ${c.barangay} | ${c.name} | dob=${c.dob}`);

  if (!APPLY) {
    console.log("\nDry-run complete. Re-run with --apply to write.");
    return;
  }

  // 1. Insert cloned rows as drafts.
  let inserted = [];
  for (const batch of chunks(toInsert, INSERT_CHUNK)) {
    const { data, error } = await supabase.from("tbl_assessments").insert(batch).select("id");
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted.push(...(data || []));
  }
  console.log(`\nInserted ${inserted.length} ${TARGET_MONTH} draft rows.`);

  // 2. Explicitly set the monthly submission status to Submitted for every
  //    target-barangay row in the November window (cloned + any pre-existing).
  const novRows = await fetchAssessmentsForChildren(targetIds, TARGET_MONTH);
  const draftIds = novRows.filter((r) => r.submission_status !== "submitted").map((r) => r.id);
  let submitted = 0;
  for (const ids of chunks(draftIds, CHUNK)) {
    const { data, error } = await supabase
      .from("tbl_assessments")
      .update({ submission_status: "submitted" })
      .in("id", ids)
      .eq("status", "active")
      .select("id");
    if (error) throw new Error(`Submit update failed: ${error.message}`);
    submitted += (data || []).length;
  }
  console.log(`Marked ${submitted} ${TARGET_MONTH} rows as submitted.`);

  // 3. Refresh caches/revision counters so the UI picks the new month up.
  await bustAll(["reports:*", "assessments:*", "children:*"]);
  await touchRevs([TARGET_MONTH]);
  console.log("Cache busted and revision counters bumped for", TARGET_MONTH);

  // 4. Verify.
  const final = await fetchAssessmentsForChildren(targetIds, TARGET_MONTH);
  const byChild = new Map();
  for (const r of final) byChild.set(r.child_id, (byChild.get(r.child_id) || 0) + 1);
  const dupes = [...byChild.entries()].filter(([, n]) => n > 1);
  const notSubmitted = final.filter((r) => r.submission_status !== "submitted");
  console.log("\n=== Verification ===");
  console.log(`  ${TARGET_MONTH} rows for target barangays: ${final.length}`);
  console.log(`  distinct children covered: ${byChild.size} / ${targets.length}`);
  console.log(`  children with duplicate rows: ${dupes.length}`);
  console.log(`  rows not marked submitted: ${notSubmitted.length}`);
  const verifyByBarangay = {};
  for (const r of final) {
    const child = targets.find((c) => c.id === r.child_id);
    const b = child?.barangay || "?";
    verifyByBarangay[b] = verifyByBarangay[b] || { total: 0, submitted: 0 };
    verifyByBarangay[b].total += 1;
    if (r.submission_status === "submitted") verifyByBarangay[b].submitted += 1;
  }
  for (const b of Object.keys(verifyByBarangay).sort(
    (a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])
  )) {
    const v = verifyByBarangay[b];
    console.log(`  ${b.padEnd(26)} rows=${String(v.total).padStart(4)} submitted=${String(v.submitted).padStart(4)}`);
  }
  if (dupes.length || notSubmitted.length || byChild.size !== targets.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("\nClone failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    // ioredis keeps the event loop alive; exit explicitly.
    process.exit(process.exitCode || 0);
  });
