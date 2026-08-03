const supabase = require("../config/supabase");

const TABLE_NAME = "tbl_users";
const PUBLIC_COLUMNS = "id, email, role, assigned_barangay, status, created_at";

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function findAll() {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select(PUBLIC_COLUMNS);
  if (error) throw error;
  return data;
}

async function findById(id) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select(PUBLIC_COLUMNS).eq("id", id).single();
  if (error) throw error;
  return data;
}

async function findByEmail(email) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select("*").eq("email", email).single();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function create({ email, passwordHash, role, assigned_barangay }) {
  requireSupabase();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({ email, password: passwordHash, role, assigned_barangay })
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

async function updateStatus(id, status) {
  requireSupabase();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ status })
    .eq("id", id)
    .select(PUBLIC_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

module.exports = { findAll, findById, findByEmail, create, updateStatus };
