/**
 * Caloocan late→administered curation.
 *
 * For every ACTIVE child in Barangay Caloocan:
 * - Children with ANY overdue dose still inside its 1-month grace window
 *   (age <= window_end + 1) are left FULLY untouched (records + dob).
 * - All other children who are behind get every actionable (due/overdue)
 *   dose recorded as administered today; Seconds left waiting on the
 *   6-month interval by that are recorded too, so they read complete.
 * - Children already complete/waiting/upcoming/not-eligible are untouched.
 *
 * Idempotent: re-running finds no actionable doses and writes nothing.
 *
 * Usage:
 *   node scripts/curateCaloocanLate.js --dry-run
 *   node scripts/curateCaloocanLate.js
 */
require("dotenv").config();

const supabase = require("../src/config/supabase");
const { calculateAgeInMonths, todayInManila } = require("../src/utils/date");
const {
  GRACE_MONTHS,
  getSupplementSchedule,
  getComplianceStatus,
} = require("../src/services/supplementSchedule.service");

const DRY_RUN = process.argv.includes("--dry-run");
const TYPES = ["Vitamin A", "Deworming"];

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

function summaryOf(comp) {
  return TYPES.map((t) => {
    const v = comp[t];
    if (v.status === "due") return `${t.split(" ")[0]}:DUE${v.overdue ? "(overdue)" : ""} ${v.requirement}`;
    if (v.status === "waiting") return `${t.split(" ")[0]}:WAIT ${v.requirement}`;
    return `${t.split(" ")[0]}:${v.status}`;
  }).join(" | ");
}

async function main() {
  if (!supabase) throw new Error("Supabase is not configured (backend/.env).");
  const today = todayInManila();
  console.log(`=== Caloocan late->administered (${DRY_RUN ? "DRY RUN" : "LIVE"}) · today ${today} ===`);

  const children = await fetchAll("tbl_children", "id,name,dob,barangay", { status: "active", barangay: "Caloocan" });
  const supps = await fetchAll(
    "tbl_supplements",
    "id,child_id,supplement_type,dose_order,date_administered,age_in_months",
    { status: "active" }
  );
  const byChild = new Map();
  for (const r of supps) {
    if (!byChild.has(r.child_id)) byChild.set(r.child_id, []);
    byChild.get(r.child_id).push(r);
  }
  console.log(`Active Caloocan children: ${children.length}`);

  const toInsert = [];
  let untouchedGrace = 0;
  let untouchedClear = 0;
  let marked = 0;
  const details = [];

  for (const child of children) {
    const age = calculateAgeInMonths(child.dob, today);
    const recs = byChild.get(child.id) || [];
    const schedule = getSupplementSchedule(age, recs, child.dob, today);
    const entries = [...schedule["Vitamin A"], ...schedule["Deworming"]];

    // Grace guard: any overdue dose still inside its 1-month grace window
    // keeps the WHOLE child untouched.
    const inGrace = entries.filter((e) => e.status === "overdue" && age <= e.window_end_month + GRACE_MONTHS);
    if (inGrace.length > 0) {
      untouchedGrace += 1;
      details.push(`UNTOUCHED (grace) ${child.name} (${age}mo): ${inGrace.map((e) => e.requirement).join(" + ")}`);
      continue;
    }

    const actionable = entries.filter((e) => e.actionable);
    if (actionable.length === 0) {
      untouchedClear += 1;
      continue;
    }

    // Record every actionable dose as given today…
    const simulated = recs.map((r) => ({ ...r }));
    for (const e of actionable) {
      const row = {
        child_id: child.id,
        supplement_type: e.supplement_type,
        dose_order: e.dose_order,
        age_in_months: age,
        date_administered: today,
      };
      toInsert.push(row);
      simulated.push({ ...row });
    }
    // …then resolve any Second left waiting on the fresh 6-month interval,
    // so the child reads complete instead of waiting.
    const again = getSupplementSchedule(age, simulated, child.dob, today);
    for (const e of [...again["Vitamin A"], ...again["Deworming"]]) {
      if (e.status === "waiting") {
        const row = {
          child_id: child.id,
          supplement_type: e.supplement_type,
          dose_order: e.dose_order,
          age_in_months: age,
          date_administered: today,
        };
        toInsert.push(row);
        simulated.push({ ...row });
      }
    }
    const before = summaryOf(getComplianceStatus(age, recs, child.dob, today));
    const after = summaryOf(getComplianceStatus(age, simulated, child.dob, today));
    marked += 1;
    details.push(`MARKED ${child.name} (${age}mo): [${before}] -> [${after}]`);
  }

  console.log(`\nUntouched (in grace): ${untouchedGrace} · untouched (nothing late): ${untouchedClear} · to mark: ${marked} children, ${toInsert.length} rows`);
  details.forEach((l) => console.log((l.startsWith("UNTOUCHED (grace)") ? "  ~ " : "  + ") + l));

  if (!DRY_RUN && toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase.from("tbl_supplements").insert(toInsert.slice(i, i + 500));
      if (error) throw new Error(`insert: ${error.message}`);
    }
    console.log(`\nInserted ${toInsert.length} rows. Re-verifying from database…`);
    const supps2 = await fetchAll(
      "tbl_supplements",
      "id,child_id,supplement_type,dose_order,date_administered,age_in_months",
      { status: "active" }
    );
    const byChild2 = new Map();
    for (const r of supps2) {
      if (!byChild2.has(r.child_id)) byChild2.set(r.child_id, []);
      byChild2.get(r.child_id).push(r);
    }
    let ok = 0;
    let bad = 0;
    for (const child of children) {
      const age = calculateAgeInMonths(child.dob, today);
      const comp = getComplianceStatus(age, byChild2.get(child.id) || [], child.dob, today);
      const states = TYPES.map((t) => comp[t].status);
      const stillLate = states.includes("due");
      if (stillLate) {
        bad += 1;
        console.log(`  ! still late: ${child.name} (${age}mo): ${summaryOf(comp)}`);
      } else {
        ok += 1;
      }
    }
    console.log(`Re-verify: ${ok} not-late, ${bad} still late`);
  } else if (DRY_RUN) {
    console.log("\n(dry run: nothing written)");
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
