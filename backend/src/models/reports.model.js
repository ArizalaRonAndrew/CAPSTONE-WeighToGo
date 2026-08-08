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
  const { data, error } = await supabase
    .from("tbl_supplements")
    .select("*, tbl_children(barangay)")
    .eq("status", "active")
    .gte("date_administered", start)
    .lt("date_administered", end);
  if (error) throw error;
  return data;
}

module.exports = {
  fetchAssessmentsWithBarangay,
  fetchAssessmentsWithChildren,
  countChildren,
  countNewChildren,
  fetchSupplementsWithBarangay,
};
