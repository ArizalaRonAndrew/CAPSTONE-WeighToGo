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
  countChildren,
  countNewChildren,
  fetchSupplementsWithBarangay,
};
