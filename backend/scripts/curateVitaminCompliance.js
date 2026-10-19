/**
 * Vitamin-compliance test curation.
 *
 * - Every ACTIVE child OUTSIDE Barangay Caloocan with age >= 6 months gets a
 *   complete supplement history (every dose window at/before their current
 *   age recorded as given) for both Vitamin A and Deworming.
 * - Barangay Caloocan is strictly excluded from the backfill; instead a set
 *   of Caloocan children is curated into distinct edge-case states so each
 *   branch of the compliance function can be evaluated.
 *
 * Usage:
 *   node scripts/curateVitaminCompliance.js --dry-run   # plan only, no writes
 *   node scripts/curateVitaminCompliance.js             # live run
 */
require("dotenv").config();

const supabase = require("../src/config/supabase");
const {
  calculateAgeInMonths,
  todayInManila,
  addMonths,
} = require("../src/utils/date");
const {
  getScheduleWindows,
  getComplianceStatus,
  getDueSupplements,
  addMonthsToDateStr,
} = require("../src/services/supplementSchedule.service");

const DRY_RUN = process.argv.includes("--dry-run");
const CHUNK = 500;

function addMonthsToDate(dateStr, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
  if (!m) throw new Error(`Bad date: ${dateStr}`);
  const day = Number(m[3]);
  const target = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  const y = target.getUTCFullYear();
  const mo = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

async function fetchActiveChildren() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("tbl_children")
      .select("id,name,dob,barangay,status")
      .eq("status", "active")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`fetch children: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Every dose window whose start the child has reached counts as administered,
// dated at that window's opening (same day-of-month as birth) so the 6-month
// First->Second interval is inherently satisfied (opens land exactly on the
// Second window's start in the normal case).
function completeRowsForChild(child, today) {
  const age = calculateAgeInMonths(child.dob, today);
  const rows = [];
  for (const type of ["Vitamin A", "Deworming"]) {
    for (const w of getScheduleWindows(type)) {
      if (w.start_month > age) continue; // future window: never pre-record
      const date = addMonthsToDate(child.dob, w.start_month);
      if (date > today) continue; // day-edge safety
      rows.push({
        child_id: child.id,
        supplement_type: type,
        dose_order: w.dose_order,
        age_in_months: calculateAgeInMonths(child.dob, date),
        date_administered: date,
      });
    }
  }
  return { age, rows };
}

async function deleteSupplementsFor(childIds, label) {
  let deleted = 0;
  for (let i = 0; i < childIds.length; i += 200) {
    const chunk = childIds.slice(i, i + 200);
    if (DRY_RUN) {
      deleted += -1; // unknown without querying; counted in verify step
      continue;
    }
    const { error, count } = await supabase
      .from("tbl_supplements")
      .delete({ count: "exact" })
      .in("child_id", chunk);
    if (error) throw new Error(`delete ${label}: ${error.message}`);
    deleted += count || 0;
  }
  return deleted;
}

async function insertRows(rows) {
  if (DRY_RUN || !rows.length) return 0;
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("tbl_supplements").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`insert: ${error.message}`);
    n += Math.min(CHUNK, rows.length - i);
  }
  return n;
}

function fmtDue(due) {
  return due.map((d) => `${d.supplement_type} ${d.requirement}${d.overdue ? " OVERDUE" : ""}`).join(" | ") || "(none)";
}

function fmtCompliance(c) {
  return Object.entries(c)
    .map(([t, v]) => {
      if (v.status === "due") return `${t}: DUE ${v.requirement}${v.overdue ? " (overdue)" : ""}`;
      if (v.status === "waiting")
        return `${t}: WAITING ${v.requirement} opens ${v.opens_on_date || `${v.opens_at_month}m`}`;
      return `${t}: ${v.status}`;
    })
    .join(" ; ");
}

async function main() {
  if (!supabase) throw new Error("Supabase is not configured (backend/.env).");
  const today = todayInManila();
  console.log(`=== Vitamin compliance curation (${DRY_RUN ? "DRY RUN" : "LIVE"}) · today ${today} ===\n`);

  const children = await fetchActiveChildren();
  const outside = children.filter((c) => c.barangay !== "Caloocan");
  const caloocan = children.filter((c) => c.barangay === "Caloocan");
  console.log(`Active children: ${children.length} (outside Caloocan: ${outside.length}, Caloocan: ${caloocan.length})`);

  // ---------- Phase 1: backfill everyone outside Caloocan ----------
  let eligible = 0;
  let plannedRows = 0;
  const backfillRows = [];
  for (const child of outside) {
    const { age, rows } = completeRowsForChild(child, today);
    if (age < 6) continue; // not yet eligible for any supplement
    eligible += 1;
    plannedRows += rows.length;
    backfillRows.push(...rows);
  }
  console.log(`Eligible outside Caloocan (age>=6): ${eligible} children -> ${plannedRows} supplement rows`);

  const wiped = await deleteSupplementsFor(outside.map((c) => c.id), "backfill");
  const inserted = await insertRows(backfillRows);
  console.log(DRY_RUN ? "(dry run: no deletes/inserts performed)" : `Wiped ${wiped} old rows, inserted ${inserted} complete rows`);

  // ---------- Phase 2: curate Caloocan edge cases ----------
  // Reuse the 2 existing children (pin to exact ages) + create TEST children.
  const dobForAge = (months) => {
    const [y, m, d] = today.split("-").map(Number);
    const day = Math.min(d, 28);
    const base = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return `${addMonths(base.slice(0, 7), -months)}-${String(day).padStart(2, "0")}`;
  };

  const byName = new Map(caloocan.map((c) => [c.name, c]));
  const raniel = byName.get("Raniel Mercado Lopez");
  const johnrey = byName.get("Johnrey Ilao Bagunas");
  if (!raniel || !johnrey) throw new Error("Expected Caloocan seed children not found; aborting Caloocan curation.");

  const curated = [
    // [childRef, targetAgeMonths, expectation, buildRecords(recordsSoFar) -> rows]
    {
      key: "raniel-grace", child: raniel, age: 18, expect: "GRACE: First 12-17 OVERDUE (1-mo grace), Second locked",
      rows: () => [],
    },
    {
      key: "johnrey-overdue", child: johnrey, age: 26, expect: "OVERDUE 2nd: Second 12-23 OVERDUE + First 24-35 due",
      rows: (dob) => [
        { type: "Vitamin A", order: 2, atAge: 12 },
        { type: "Deworming", order: 1, atAge: 12 },
      ].map((r) => toRow(johnrey.id, dob, r)),
    },
  ];

  function toRow(childId, dob, { type, order, atAge, atDate }) {
    const date = atDate || addMonthsToDate(dob, atAge);
    return {
      child_id: childId,
      supplement_type: type,
      dose_order: order,
      age_in_months: calculateAgeInMonths(dob, date),
      date_administered: date,
    };
  }

  const newKids = [
    { name: "Test Case Ready", age: 14, expect: "READY: First 12-23 due (both types)", rows: () => [] },
    { name: "Test Case Waiting", age: 16, expect: "WAITING: Second opens 6mo after First date", firstAtAge: 14 },
    { name: "Test Case Single", age: 8, expect: "READY single: VitA 6mo due; Deworming not eligible", rows: () => [] },
    { name: "Test Case Complete", age: 30, expect: "COMPLETE: both types complete", complete: true },
    { name: "Test Case Young", age: 3, expect: "NOT ELIGIBLE: both types", rows: () => [] },
  ];

  // Pin existing children to exact ages.
  const caloocanChildIds = [raniel.id, johnrey.id];
  for (const spec of curated) {
    const dob = dobForAge(spec.age);
    spec.dob = dob;
    if (!DRY_RUN) {
      const { error } = await supabase.from("tbl_children").update({ dob }).eq("id", spec.child.id);
      if (error) throw new Error(`update dob ${spec.child.name}: ${error.message}`);
    }
    spec.childId = spec.child.id;
  }

  // Create TEST children.
  for (const kid of newKids) {
    kid.dob = dobForAge(kid.age);
    if (DRY_RUN) {
      kid.childId = `dry-run-${kid.name}`;
      continue;
    }
    const { data, error } = await supabase
      .from("tbl_children")
      .insert({
        name: kid.name,
        dob: kid.dob,
        parent_name: "Test Guardian",
        parent_contact: null,
        barangay: "Caloocan",
        purok: "Purok 1",
        gender: "Male",
        is_ip: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(`create ${kid.name}: ${error.message}`);
    kid.childId = data.id;
    caloocanChildIds.push(data.id);
  }

  // Wipe Caloocan supplement history, then write curated rows.
  await deleteSupplementsFor(caloocanChildIds.filter((id) => typeof id !== "string" || !id.startsWith("dry-run")), "caloocan");
  const curatedRows = [];
  for (const spec of curated) {
    for (const r of spec.rows(spec.dob)) curatedRows.push(r);
  }
  for (const kid of newKids) {
    if (kid.complete) {
      const { rows } = completeRowsForChild({ id: kid.childId, dob: kid.dob }, today);
      curatedRows.push(...rows);
    } else if (kid.firstAtAge !== undefined) {
      // First given recently -> Second must wait out the exact 6-month gap.
      const firstDate = addMonthsToDate(kid.dob, kid.firstAtAge);
      for (const [type, order] of [["Vitamin A", 2], ["Deworming", 1]]) {
        curatedRows.push({
          child_id: kid.childId,
          supplement_type: type,
          dose_order: order,
          age_in_months: calculateAgeInMonths(kid.dob, firstDate),
          date_administered: firstDate,
        });
      }
      kid.firstDate = firstDate;
      kid.opensOn = addMonthsToDateStr(firstDate, 6);
    }
  }
  const curatedInserted = await insertRows(curatedRows.filter((r) => typeof r.child_id !== "string" || !String(r.child_id).startsWith("dry-run")));
  console.log(`Caloocan: ${caloocanChildIds.length} children curated, ${curatedInserted} curated rows`);

  // ---------- Phase 3: verification ----------
  console.log("\n--- Caloocan verification (computed from final records) ---");
  async function recordsFor(childId) {
    if (DRY_RUN) {
      // Simulate from the rows we would have written.
      return curatedRows.filter((r) => String(r.child_id) === String(childId));
    }
    const { data, error } = await supabase.from("tbl_supplements").select("*").eq("child_id", childId).eq("status", "active");
    if (error) throw new Error(`verify fetch: ${error.message}`);
    return data;
  }
  const cases = [
    ...curated.map((s) => ({ label: s.key, name: s.child.name, childId: s.childId, dob: s.dob, expect: s.expect })),
    ...newKids.map((k) => ({ label: "test", name: k.name, childId: k.childId, dob: k.dob, expect: k.expect })),
  ];
  for (const c of cases) {
    const age = calculateAgeInMonths(c.dob, today);
    const recs = await recordsFor(c.childId);
    const comp = getComplianceStatus(age, recs, c.dob, today);
    const due = getDueSupplements(age, recs, age, c.dob, today);
    console.log(`\n[${c.name}] age ${age}mo · dob ${c.dob} · records ${recs.length}`);
    console.log(`  expect: ${c.expect}`);
    console.log(`  compliance: ${fmtCompliance(comp)}`);
    console.log(`  due: ${fmtDue(due)}`);
  }

  if (!DRY_RUN) {
    // Global sanity: every eligible outsider must now read as complete.
    const { data: allSup, error } = await supabase.from("tbl_supplements").select("child_id,supplement_type,dose_order,date_administered,age_in_months").eq("status", "active");
    if (error) throw new Error(`final fetch: ${error.message}`);
    const byChild = new Map();
    for (const r of allSup) {
      if (!byChild.has(r.child_id)) byChild.set(r.child_id, []);
      byChild.get(r.child_id).push(r);
    }
    let complete = 0;
    let incomplete = 0;
    const incompleteNames = [];
    for (const child of outside) {
      const age = calculateAgeInMonths(child.dob, today);
      if (age < 6) continue;
      const comp = getComplianceStatus(age, byChild.get(child.id) || [], child.dob, today);
      const done = comp["Vitamin A"].status === "complete" && ["complete", "not_eligible"].includes(comp["Deworming"].status);
      if (done) complete += 1;
      else {
        incomplete += 1;
        if (incompleteNames.length < 10) incompleteNames.push(`${child.name} (${age}mo): ${fmtCompliance(comp)}`);
      }
    }
    console.log(`\nBackfill check: ${complete} complete, ${incomplete} incomplete`);
    incompleteNames.forEach((l) => console.log(`  ! ${l}`));
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
