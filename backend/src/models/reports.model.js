const supabase = require("../config/supabase");

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function fetchAssessmentsWithBarangay({ start, end }) {
  requireSupabase();
  const { data, error } = await supabase
    .from("tbl_assessments")
    .select("*, tbl_children(barangay)")
    .eq("status", "active")
    .gte("date_measured", start)
    .lt("date_measured", end);
  if (error) throw error;
  return data;
}

async function fetchAssessmentsWithChildren({ start, end }) {
  requireSupabase();
  const { data, error } = await supabase
    .from("tbl_assessments")
    .select("*, tbl_children(*)")
    .eq("status", "active")
    .gte("date_measured", start)
    .lt("date_measured", end);
  if (error) throw error;
  return data;
}

async function countChildren({ barangay }) {
  requireSupabase();
  let query = supabase.from("tbl_children").select("id", { count: "exact", head: true }).eq("status", "active");
  if (barangay) query = query.eq("barangay", barangay);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

async function fetchSupplementsWithBarangay({ start, end }) {
  requireSupabase();
  const { data, error } = await supabase
    .from("tbl_supplements")
    .select("*, tbl_children(barangay)")
    .eq("status", "active")
    .gte("date_administered", start)
    .lt("date_administered", end);
  if (error) throw error;
  return data;
}

const SUBMISSIONS_TABLE = "tbl_report_submissions";

// Returns a Set of "barangay|YYYY-MM" keys that have been submitted to the admin.
async function fetchSubmittedSet({ barangay } = {}) {
  requireSupabase();
  let query = supabase.from(SUBMISSIONS_TABLE).select("barangay, month");
  if (barangay) query = query.eq("barangay", barangay);
  const { data, error } = await query;
  if (error) throw error;
  return new Set(data.map((row) => `${row.barangay}|${row.month}`));
}

async function findSubmission({ barangay, month }) {
  requireSupabase();
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .select("*")
    .eq("barangay", barangay)
    .eq("month", month)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function submitReport({ barangay, month, submitted_by }) {
  requireSupabase();
  const { data, error } = await supabase
    .from(SUBMISSIONS_TABLE)
    .upsert({ barangay, month, submitted_by, submitted_at: new Date().toISOString() }, { onConflict: "barangay,month" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  fetchAssessmentsWithBarangay,
  fetchAssessmentsWithChildren,
  countChildren,
  fetchSupplementsWithBarangay,
  fetchSubmittedSet,
  findSubmission,
  submitReport,
};
