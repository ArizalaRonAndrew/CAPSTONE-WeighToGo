const supabase = require("../config/supabase");

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

// PostgREST caps each response at 1000 rows by default and truncates
// silently (no error, no warning) rather than telling the caller more rows
// exist. A single active municipality can clear 1000 checkups in a month
// across all barangays, so queries that don't expect a single page ahead of
// time must page through with .range() instead of trusting one request.
//
// Page 1 asks for `count: exact` (via buildQuery({ withCount })), so the
// remaining pages fetch CONCURRENTLY — sequential paging stacked ~280 ms per
// round trip, which at 48k+ assessments/yr (49 pages) hit ~13.6 s server-side
// and blew the admin GET's 20 s client timeout (surfacing as "offline"
// mid-report). Legacy call sites that ignore the opts arg still work: count
// comes back null and the sequential walk runs exactly as before.
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery) {
  const first = await buildQuery({ withCount: true }).range(0, PAGE_SIZE - 1);
  if (first.error) throw first.error;
  const rows = [...(first.data || [])];

  const total = first.count;
  if (typeof total !== "number") {
    for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
      const { data, error } = await buildQuery({ withCount: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length < PAGE_SIZE) break;
      rows.push(...data);
    }
    return rows;
  }

  if (total > rows.length) {
    const rest = await Promise.all(
      Array.from(
        { length: Math.ceil(total / PAGE_SIZE) - 1 },
        (_, i) => buildQuery({ withCount: false }).range((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1)
      )
    );
    // Promise.all preserves result order, so row order matches the pages.
    for (const page of rest) {
      if (page.error) throw page.error;
      rows.push(...(page.data || []));
    }
  }
  return rows;
}

async function fetchAssessmentsWithBarangay({ start, end }) {
  requireSupabase();
  return fetchAllPages(({ withCount }) =>
    supabase
      .from("tbl_assessments")
      .select("*, tbl_children(barangay)", withCount ? { count: "exact" } : undefined)
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

async function fetchAssessmentsWithChildren({ start, end }) {
  requireSupabase();
  return fetchAllPages(({ withCount }) =>
    supabase
      .from("tbl_assessments")
      .select("*, tbl_children(*)", withCount ? { count: "exact" } : undefined)
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

// Slim projection for tally-only endpoints (trends, comparison, map health,
// nutrition, masterlist summary). Includes id/child_id/date_measured so the
// Q1 dedupe (one record per child for Jan–Mar) can pick the earliest row per
// (child, period) instead of triple-counting duplicates.
//
// Optional in-query scoping so callers don't have to transfer rows they're
// about to throw away: `submittedOnly` gates drafts (the same predicate
// filterSubmittedForRole applies post-fetch), and `barangay` filters through
// the child join (rows where the child embed is missing or a different
// barangay are excluded, matching filterByBarangay). Legacy callers pass
// only { start, end } and get the original unguarded scan.
async function fetchTrendRows({ start, end, barangay, submittedOnly } = {}) {
  requireSupabase();
  return fetchAllPages(({ withCount }) => {
    let query = supabase
      .from("tbl_assessments")
      .select(
        "id,child_id,date_measured,wfa_status,hfa_status,wfl_h_status,submission_status,tbl_children(barangay,purok)",
        withCount ? { count: "exact" } : undefined
      )
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end);
    if (submittedOnly) query = query.eq("submission_status", "submitted");
    if (barangay) query = query.eq("tbl_children.barangay", barangay);
    return query;
  });
}

// Fast path for GET /reports/trends: the counting happens IN Postgres via
// the trend_counts() SQL function — one indexed GROUP-BY pass returning ~30
// (period, status, count) rows — instead of shipping the full year of
// assessment rows (potentially 48k+, ~49 PostgREST pages) to Node and
// tallying them across five JS passes.
//
// Semantics mirror the fallback scan path exactly:
// - status = 'active', date_measured in [start, end)
// - p_submitted_only gates drafts (MNAO only sees submitted rows)
// - p_barangay scopes through the tbl_children join
// - Jan–Mar collapses to "YYYY-Q1", then DISTINCT ON keeps the earliest
//   row per (child, period) — same rule as dedupeByChildPerPeriod
//
// Returns [{ period, status, total }] with zero-count combinations omitted;
// the controller fills zero buckets from periodsBetween, as it always has.
// Throws if the SQL function isn't installed yet — callers fall back to the
// scan path in that case.
async function fetchTrendCounts({ start, end, indicator, barangay = null, submittedOnly = true }) {
  requireSupabase();
  const { data, error } = await supabase.rpc("trend_counts", {
    p_start: start,
    p_end: end,
    p_indicator: indicator,
    p_barangay: barangay,
    p_submitted_only: submittedOnly,
  });
  if (error) throw error;
  return data || [];
}

// Growth-summary projection: everything getGrowthSummaryReport tallies
// (brackets from age_in_months, gender split, statuses) plus the barangay
// join for scoping — without the weight/height/measurement columns.
// Includes id/child_id/date_measured for the same Q1 dedupe.
async function fetchGrowthRows({ start, end }) {
  requireSupabase();
  return fetchAllPages(({ withCount }) =>
    supabase
      .from("tbl_assessments")
      .select(
        "id,child_id,date_measured,age_in_months,wfa_status,hfa_status,wfl_h_status,submission_status,tbl_children(barangay,gender)",
        withCount ? { count: "exact" } : undefined
      )
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

function escapeIlike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// General nutrition-status predicate for the masterlist rows query (see
// fetchMasterlistPage). Exact status values match ANY indicator via a single
// PostgREST `or` clause; group keys mirror tallyMasterlistKpis in the
// controller so the filter options and the KPI tiles always agree.
function applyGeneralStatusFilter(query, status) {
  const value = String(status).trim();
  const key = value.toLowerCase();
  if (key === "normal") {
    return query.eq("wfa_status", "Normal").eq("hfa_status", "Normal").eq("wfl_h_status", "Normal");
  }
  if (key === "at-risk" || key === "at_risk" || key === "malnourished") {
    return query.or(
      "wfa_status.in.(Underweight,Severely Underweight)," +
        "hfa_status.in.(Stunted,Severely Stunted)," +
        "wfl_h_status.in.(Wasted,Severely Wasted)"
    );
  }
  if (key === "severe") {
    return query.or(
      "wfa_status.eq.Severely Underweight," +
        "hfa_status.eq.Severely Stunted," +
        "wfl_h_status.eq.Severely Wasted"
    );
  }
  if (key === "over-obese" || key === "overweight-obese" || key === "overweight/obese") {
    return query.or("wfa_status.eq.Overweight,wfl_h_status.in.(Overweight,Obese)");
  }
  return query.or(`wfa_status.eq.${value},hfa_status.eq.${value},wfl_h_status.eq.${value}`);
}

// Server-paginated masterlist detail page: filters, global sort, and the
// total all resolve in Postgres (one round trip), so the admin table never
// transfers the month's full row set. The child join is !inner so barangay /
// purok / name predicates apply before paging, not after. MNAO callers are
// restricted to submitted rows in-query, mirroring filterSubmittedForRole.
//
// Nutrition-status filtering resolves in-query too (so the exact total still
// matches the pages):
// - wfa / hfa / wfl_h narrow one indicator to an exact status (ANDed).
// - status is the general filter: an exact status value matches ANY
//   indicator (OR), while group keys match the shared KPI buckets —
//   "normal" (all three Normal), "at-risk" (any underweight/stunted/wasted),
//   "severe" (any Severely ...), "over-obese" (Overweight/Obese anywhere).
// Values are whitelisted in the controller; anything reaching the fallthrough
// below is an exact status matched against all three indicators.
async function fetchMasterlistPage({ start, end, barangay, purok, search, page, pageSize, submittedOnly, wfa, hfa, wfl_h, status }) {
  requireSupabase();
  let query = supabase
    .from("tbl_assessments")
    .select(
      "id,child_id,date_measured,weight,height,age_in_months,wfa_status,hfa_status,wfl_h_status," +
        "tbl_children!inner(id,name,dob,parent_name,barangay,purok,gender,is_ip)",
      { count: "exact" }
    )
    .eq("status", "active")
    .gte("date_measured", start)
    .lt("date_measured", end);
  if (submittedOnly) query = query.eq("submission_status", "submitted");
  if (barangay) query = query.eq("tbl_children.barangay", barangay);
  if (purok) query = query.eq("tbl_children.purok", purok);
  if (search) query = query.ilike("tbl_children.name", `%${escapeIlike(search)}%`);
  if (wfa) query = query.eq("wfa_status", wfa);
  if (hfa) query = query.eq("hfa_status", hfa);
  if (wfl_h) query = query.eq("wfl_h_status", wfl_h);
  if (status) query = applyGeneralStatusFilter(query, status);
  query = query
    .order("purok", { foreignTable: "tbl_children", ascending: true })
    .order("name", { foreignTable: "tbl_children", ascending: true });
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: data || [], total: count ?? (data || []).length };
}

// Unpaged variant used only for the Jan–Mar quarter: fetches every matching
// row (same filters as fetchMasterlistPage, plus submission_status for the
// MNAO gate) so the controller can collapse to one record per child for the
// quarter and then paginate in memory. Regular months keep the SQL-paged
// path above; Q1 needs this because Postgres would otherwise page over the
// pre-consolidation duplicates (Jan+Feb+Mar rows) and triple-count them.
async function fetchMasterlistAll({ start, end, barangay, purok, search, submittedOnly, wfa, hfa, wfl_h, status }) {
  requireSupabase();
  const build = ({ withCount }) => {
    let query = supabase
      .from("tbl_assessments")
      .select(
        "id,child_id,date_measured,weight,height,age_in_months,wfa_status,hfa_status,wfl_h_status,submission_status," +
          "tbl_children!inner(id,name,dob,parent_name,barangay,purok,gender,is_ip)",
        withCount ? { count: "exact" } : undefined
      )
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end);
    if (submittedOnly) query = query.eq("submission_status", "submitted");
    if (barangay) query = query.eq("tbl_children.barangay", barangay);
    if (purok) query = query.eq("tbl_children.purok", purok);
    if (search) query = query.ilike("tbl_children.name", `%${escapeIlike(search)}%`);
    if (wfa) query = query.eq("wfa_status", wfa);
    if (hfa) query = query.eq("hfa_status", hfa);
    if (wfl_h) query = query.eq("wfl_h_status", wfl_h);
    if (status) query = applyGeneralStatusFilter(query, status);
    return query.order("date_measured", { ascending: true }).order("id", { ascending: true });
  };
  return fetchAllPages(build);
}

// Distinct puroks for a barangay's filter dropdown (slim two-column scan).
async function fetchPuroks({ barangay } = {}) {
  requireSupabase();
  const rows = await fetchAllPages(({ withCount }) => {
    let query = supabase
      .from("tbl_children")
      .select("barangay,purok", withCount ? { count: "exact" } : undefined)
      .eq("status", "active");
    if (barangay) query = query.eq("barangay", barangay);
    return query.order("purok", { ascending: true });
  });
  return [...new Set(rows.map((r) => r.purok).filter(Boolean))].sort();
}

async function countChildren({ barangay, purok }) {
  requireSupabase();
  let query = supabase.from("tbl_children").select("id", { count: "exact", head: true }).eq("status", "active");
  if (barangay) query = query.eq("barangay", barangay);
  if (purok) query = query.eq("purok", purok);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function countNewChildren({ barangay, purok, start, end }) {
  requireSupabase();
  let query = supabase
    .from("tbl_children")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("created_at", start)
    .lt("created_at", end);
  if (barangay) query = query.eq("barangay", barangay);
  if (purok) query = query.eq("purok", purok);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function fetchSupplementsWithBarangay({ start, end }) {
  requireSupabase();
  return fetchAllPages(({ withCount }) =>
    supabase
      .from("tbl_supplements")
      .select("*, tbl_children(barangay)", withCount ? { count: "exact" } : undefined)
      .eq("status", "active")
      .gte("date_administered", start)
      .lt("date_administered", end)
  );
}

module.exports = {
  fetchAssessmentsWithBarangay,
  fetchAssessmentsWithChildren,
  fetchTrendRows,
  fetchTrendCounts,
  fetchGrowthRows,
  fetchMasterlistPage,
  fetchMasterlistAll,
  fetchPuroks,
  countChildren,
  countNewChildren,
  fetchSupplementsWithBarangay,
};
