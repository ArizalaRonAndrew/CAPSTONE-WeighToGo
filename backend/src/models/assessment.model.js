const supabase = require("../config/supabase");
const { applyStatusFilter } = require("./queryHelpers");

const TABLE_NAME = "tbl_assessments";

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function findAll({ childId, childIds, status } = {}) {
  requireSupabase();
  let query = supabase.from(TABLE_NAME).select("*");
  if (childId) query = query.eq("child_id", childId);
  if (childIds) query = query.in("child_id", childIds);
  query = applyStatusFilter(query, status);
  const { data, error } = await query.order("date_measured", { ascending: false });
  if (error) throw error;
  return data;
}

async function findById(id) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function create({
  child_id,
  date_measured,
  weight,
  height,
  age_in_months,
  wfa_status,
  hfa_status,
  wfl_h_status,
}) {
  requireSupabase();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({ child_id, date_measured, weight, height, age_in_months, wfa_status, hfa_status, wfl_h_status })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function update(id, fields) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).update(fields).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

async function softDelete(id) {
  return update(id, { status: "reject" });
}

module.exports = { findAll, findById, create, update, softDelete };
