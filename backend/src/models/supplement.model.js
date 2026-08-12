const supabase = require("../config/supabase");
const { applyStatusFilter, fetchAllPages } = require("./queryHelpers");

const TABLE_NAME = "tbl_supplements";

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function findAll({ childId, childIds, status } = {}) {
  requireSupabase();
  return fetchAllPages(() => {
    let query = supabase.from(TABLE_NAME).select("*");
    if (childId) query = query.eq("child_id", childId);
    if (childIds) query = query.in("child_id", childIds);
    query = applyStatusFilter(query, status);
    return query.order("date_administered", { ascending: false });
  });
}

async function findById(id) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function create({ child_id, supplement_type, dose_order, age_in_months, date_administered }) {
  requireSupabase();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({ child_id, supplement_type, dose_order, age_in_months, date_administered })
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
