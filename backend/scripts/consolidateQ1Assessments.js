require("dotenv").config();

// Consolidates separate Jan/Feb/Mar assessment rows into a single Q1 record.
//
// Background: January–March is one on-time assessment window — each child is
// assessed at most once for the whole quarter, and the admin Health Trends
// line chart renders Jan–Mar as a single "Jan–Mar" data point. Older data may
// still hold two or three active rows for the same child in one quarter
// (e.g. a January checkup plus a February duplicate). This script keeps the
// earliest active assessment per (child, year-Q1) and soft-rejects the extras
// (status='reject', so reports that filter status='active' stop counting them
// while history is preserved). If any rejected row was already submitted but
// the kept row is still a draft, the kept row is promoted to submitted so the
// admin does not lose visibility of that quarter.
//
// Usage:
//   node scripts/consolidateQ1Assessments.js [year] [--apply] [--dry-run]
//   - year defaults to every year present in the data (pass YYYY to limit).
//   - Without --apply nothing is written (dry run). Pass --apply to write.
//   - --dry-run is the default and can be passed explicitly for clarity.

const supabase = require("../src/config/supabase");
const { bustAll, touchRevs } = require("../src/config/redis");

if (!supabase) {
  console.error("Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in backend/.env).");
  process.exit(1);
}

const PAGE_SIZE = 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const yearArg = args.find((a) => /^\d{4}$/.test(a));
  const apply = args.includes("--apply");
  return { year: yearArg || null, apply };
}

function q1Year(dateMeasured) {
  const s = String(dateMeasured || "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const year = s.slice(0, 4);
  const month = Number(s.slice(5, 7));
  if (month < 1 || month > 3) return null;
  return year;
}

async function fetchQ1Assessments(yearFilter) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tbl_assessments")
      .select("id, child_id, date_measured, submission_status, status, created_at")
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch assessments: ${error.message}`);
    for (const r of data) {
      const y = q1Year(r.date_measured);
      if (!y) continue;
      if (yearFilter && y !== yearFilter) continue;
      rows.push(r);
    }
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const { year, apply } = parseArgs();
  console.log("\n=== Consolidate Jan–Mar (Q1) assessments ===");
  console.log(`scope: ${year || "all years"} | mode: ${apply ? "APPLY (will write)" : "DRY-RUN (no writes)"}\n`);

  console.log("Fetching active Jan–Mar assessments...");
  const rows = await fetchQ1Assessments(year);
  console.log(`  ${rows.length} active Q1 row(s) found.\n`);

  const groups = new Map();
  for (const r of rows) {
    const key = `${r.child_id}|${String(r.date_measured).slice(0, 4)}-Q1`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let duplicateGroups = 0;
  let totalExtras = 0;
  const toReject = [];
  const toPromote = [];
  const touchedMonths = new Set();

  for (const [key, list] of groups) {
    if (list.length <= 1) continue;
    duplicateGroups += 1;
    // Keep the earliest measurement (on-time assessment); ties break by
    // creation order so the result is deterministic.
    list.sort((a, b) =>
      String(a.date_measured).localeCompare(String(b.date_measured)) ||
      String(a.created_at || "").localeCompare(String(b.created_at || "")) ||
      String(a.id).localeCompare(String(b.id))
    );
    const [keep, ...extras] = list;
    totalExtras += extras.length;
    const [, yearPart] = key.split("|");
    const yr = yearPart.slice(0, 4);
    touchedMonths.add(`${yr}-01`);
    touchedMonths.add(`${yr}-02`);
    touchedMonths.add(`${yr}-03`);

    const keepSubmitted = keep.submission_status === "submitted";
    const anyExtraSubmitted = extras.some((e) => e.submission_status === "submitted");
    if (!keepSubmitted && anyExtraSubmitted) toPromote.push(keep);

    for (const e of extras) toReject.push({ keep, extra: e });

    const childLabel = keep.child_id;
    console.log(
      `  ${yr} child=${childLabel}: keep ${keep.date_measured} (id=${keep.id}, ${keep.submission_status}) | ` +
      `reject ${extras.map((e) => `${e.date_measured} (id=${e.id}, ${e.submission_status})`).join(", ")}` +
      (!keepSubmitted && anyExtraSubmitted ? " | promote kept row to submitted" : "")
    );
  }

  console.log("\n--- Summary ---");
  console.log(`  Q1 groups with duplicates: ${duplicateGroups}`);
  console.log(`  rows to soft-reject: ${toReject.length}`);
  console.log(`  kept rows to promote to submitted: ${toPromote.length}`);

  if (!apply) {
    console.log("\nDry run — no changes written. Re-run with --apply to consolidate.\n");
    process.exit(0);
  }

  if (toReject.length === 0 && toPromote.length === 0) {
    console.log("\nNothing to consolidate.\n");
    process.exit(0);
  }

  // Promote kept drafts first so the quarter stays visible to the admin.
  for (const keep of toPromote) {
    const { error } = await supabase
      .from("tbl_assessments")
      .update({ submission_status: "submitted" })
      .eq("id", keep.id);
    if (error) throw new Error(`Failed to promote ${keep.id}: ${error.message}`);
  }
  if (toPromote.length) console.log(`  promoted ${toPromote.length} kept row(s) to submitted.`);

  // Soft-reject extras in chunks (status='reject' hides them from every
  // status='active' report query while preserving history).
  const CHUNK = 200;
  for (let i = 0; i < toReject.length; i += CHUNK) {
    const chunk = toReject.slice(i, i + CHUNK).map(({ extra }) => extra.id);
    const { error } = await supabase.from("tbl_assessments").update({ status: "reject" }).in("id", chunk);
    if (error) throw new Error(`Failed to reject chunk: ${error.message}`);
  }
  console.log(`  soft-rejected ${toReject.length} duplicate row(s).`);

  await bustAll(["reports:*", "assessments:*", "children:*"]);
  await touchRevs([...touchedMonths]);
  console.log(`  cache busted + revs bumped for: ${[...touchedMonths].sort().join(", ")}`);

  console.log("\nDone.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nConsolidation failed:", err.message);
  process.exit(1);
});
