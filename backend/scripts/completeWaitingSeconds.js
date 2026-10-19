/**
 * Follow-up to curateVitaminCompliance.js: mark the still-"waiting" current
 * Second Doses as administered (dated today) so every eligible child outside
 * Caloocan reads as fully complete.
 *
 * Idempotent: only inserts a Second Dose where compliance is exactly
 * "waiting" on it AND its First Dose record exists AND no Second record
 * exists yet. Re-running is a no-op.
 *
 * Usage:
 *   node scripts/completeWaitingSeconds.js --dry-run
 *   node scripts/completeWaitingSeconds.js
 */
require("dotenv").config();

const supabase = require("../src/config/supabase");
const { calculateAgeInMonths, todayInManila } = require("../src/utils/date");
const { getComplianceStatus } = require("../src/services/supplementSchedule.service");

const DRY_RUN = process.argv.includes("--dry-run");

async function fetchAll(table, select, eqFilters = {}) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(select).order("id").range(from, from + PAGE - 1);
    for (const [k, v] of Object.entries(eqFilters)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`fetch ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  if (!supabase) throw new Error("Supabase is not configured (backend/.env).");
  const today = todayInManila();
  console.log(`=== Complete waiting Seconds (${DRY_RUN ? "DRY RUN" : "LIVE"}) · today ${today} ===`);

  const children = (await fetchAll("tbl_children", "id,name,dob,barangay", { status: "active" })).filter(
    (c) => c.barangay !== "Caloocan"
  );
  const supps = await fetchAll("tbl_supplements", "child_id,supplement_type,dose_order,date_administered,age_in_months", {
    status: "active",
  });
  const byChild = new Map();
  for (const r of supps) {
    if (!byChild.has(r.child_id)) byChild.set(r.child_id, []);
    byChild.get(r.child_id).push(r);
  }

  const toInsert = [];
  let waitingCount = 0;
  let otherIncomplete = 0;
  for (const child of children) {
    const age = calculateAgeInMonths(child.dob, today);
    if (age < 6) continue;
    const recs = byChild.get(child.id) || [];
    const comp = getComplianceStatus(age, recs, child.dob, today);
    for (const type of ["Vitamin A", "Deworming"]) {
      const v = comp[type];
      if (v.status === "complete" || v.status === "not_eligible") continue;
      if (v.status === "waiting" && v.slot === "Second Dose") {
        const hasSecond = recs.some((r) => r.supplement_type === type && r.dose_order === v.dose_order);
        if (!hasSecond) {
          waitingCount += 1;
          toInsert.push({
            child_id: child.id,
            supplement_type: type,
            dose_order: v.dose_order,
            age_in_months: age,
            date_administered: today,
          });
        }
      } else {
        otherIncomplete += 1;
        if (otherIncomplete <= 10) console.log(`  ! other: ${child.name} (${age}mo) ${type}: ${JSON.stringify(v.status)}`);
      }
    }
  }

  console.log(`Waiting Seconds to mark: ${toInsert.length} (${waitingCount} cases) · other incomplete: ${otherIncomplete}`);
  if (!DRY_RUN && toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase.from("tbl_supplements").insert(toInsert.slice(i, i + 500));
      if (error) throw new Error(`insert: ${error.message}`);
    }
    console.log(`Inserted ${toInsert.length} rows.`);
  } else if (DRY_RUN) {
    console.log("(dry run: nothing written)");
  }

  if (!DRY_RUN) {
    // Re-verify from the database.
    const supps2 = await fetchAll("tbl_supplements", "child_id,supplement_type,dose_order,date_administered,age_in_months", {
      status: "active",
    });
    const byChild2 = new Map();
    for (const r of supps2) {
      if (!byChild2.has(r.child_id)) byChild2.set(r.child_id, []);
      byChild2.get(r.child_id).push(r);
    }
    let complete = 0;
    let incomplete = 0;
    for (const child of children) {
      const age = calculateAgeInMonths(child.dob, today);
      if (age < 6) continue;
      const comp = getComplianceStatus(age, byChild2.get(child.id) || [], child.dob, today);
      const done =
        comp["Vitamin A"].status === "complete" && ["complete", "not_eligible"].includes(comp["Deworming"].status);
      if (done) complete += 1;
      else {
        incomplete += 1;
        if (incomplete <= 5)
          console.log(`  ! still incomplete: ${child.name} VitA=${comp["Vitamin A"].status} Dew=${comp["Deworming"].status}`);
      }
    }
    console.log(`Final: ${complete} complete, ${incomplete} incomplete`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
