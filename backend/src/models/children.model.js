const supabase = require("../config/supabase");
const { applyStatusFilter } = require("./queryHelpers");

const TABLE_NAME = "tbl_children";

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function findAll({ barangay, status } = {}) {
  requireSupabase();
  let query = supabase.from(TABLE_NAME).select("*");
  if (barangay) query = query.eq("barangay", barangay);
  query = applyStatusFilter(query, status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function findById(id) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function create({ name, dob, parent_name, parent_contact, barangay, purok, gender, is_ip }) {
  requireSupabase();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({ name, dob, parent_name, parent_contact, barangay, purok, gender, is_ip })
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
