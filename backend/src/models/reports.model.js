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
const PAGE_SIZE = 1000;

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

async function fetchAssessmentsWithBarangay({ start, end }) {
  requireSupabase();
  return fetchAllPages(() =>
    supabase
      .from("tbl_assessments")
      .select("*, tbl_children(barangay)")
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

async function fetchAssessmentsWithChildren({ start, end }) {
  requireSupabase();
  return fetchAllPages(() =>
    supabase
      .from("tbl_assessments")
      .select("*, tbl_children(*)")
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

// Slim projection for tally-only endpoints (trends, comparison, map health,
// nutrition, masterlist summary): same rows as fetchAssessmentsWithBarangay
// but 7 columns instead of the full assessment record, so multi-month scans
// move far less data per page. Not for endpoints that return row details.
async function fetchTrendRows({ start, end }) {
  requireSupabase();
  return fetchAllPages(() =>
    supabase
      .from("tbl_assessments")
      .select("date_measured,wfa_status,hfa_status,wfl_h_status,submission_status,tbl_children(barangay,purok)")
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

// Growth-summary projection: everything getGrowthSummaryReport tallies
// (brackets from age_in_months, gender split, statuses) plus the barangay
// join for scoping — without the weight/height/measurement columns.
async function fetchGrowthRows({ start, end }) {
  requireSupabase();
  return fetchAllPages(() =>
    supabase
      .from("tbl_assessments")
      .select("age_in_months,wfa_status,hfa_status,wfl_h_status,submission_status,tbl_children(barangay,gender)")
      .eq("status", "active")
      .gte("date_measured", start)
      .lt("date_measured", end)
  );
}

function escapeIlike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Server-paginated masterlist detail page: filters, global sort, and the
// total all resolve in Postgres (one round trip), so the admin table never
// transfers the month's full row set. The child join is !inner so barangay /
// purok / name predicates apply before paging, not after. MNAO callers are
// restricted to submitted rows in-query, mirroring filterSubmittedForRole.
async function fetchMasterlistPage({ start, end, barangay, purok, search, page, pageSize, submittedOnly }) {
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
  query = query
    .order("purok", { foreignTable: "tbl_children", ascending: true })
    .order("name", { foreignTable: "tbl_children", ascending: true });
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;
  return { rows: data || [], total: count ?? (data || []).length };
}

// Distinct puroks for a barangay's filter dropdown (slim two-column scan).
async function fetchPuroks({ barangay } = {}) {
  requireSupabase();
  const rows = await fetchAllPages(() => {
    let query = supabase.from("tbl_children").select("barangay,purok").eq("status", "active");
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
  return fetchAllPages(() =>
    supabase
      .from("tbl_supplements")
      .select("*, tbl_children(barangay)")
      .eq("status", "active")
      .gte("date_administered", start)
      .lt("date_administered", end)
  );
}

module.exports = {
  fetchAssessmentsWithBarangay,
  fetchAssessmentsWithChildren,
  fetchTrendRows,
  fetchGrowthRows,
  fetchMasterlistPage,
  fetchPuroks,
  countChildren,
  countNewChildren,
  fetchSupplementsWithBarangay,
};
