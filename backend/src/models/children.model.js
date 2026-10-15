const supabase = require("../config/supabase");
const { applyStatusFilter, fetchAllPages } = require("./queryHelpers");

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
  return fetchAllPages(() => {
    let query = supabase.from(TABLE_NAME).select("*");
    if (barangay) query = query.eq("barangay", barangay);
    query = applyStatusFilter(query, status);
    return query.order("created_at", { ascending: false });
  });
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

function normalizeChildName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function findDuplicate({ name, dob, barangay, excludeId } = {}) {
  requireSupabase();
  if (!name || !dob || !barangay) return null;
  const dobDay = String(dob).slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, name, dob, barangay")
    .eq("barangay", barangay)
    .eq("dob", dobDay)
    .eq("status", "active");
  if (error) throw error;
  const wanted = normalizeChildName(name);
  const match = (data || []).find(
    (row) =>
      normalizeChildName(row.name) === wanted &&
      String(row.id) !== String(excludeId || "")
  );
  return match || null;
}

module.exports = { findAll, findById, create, update, softDelete, findDuplicate, normalizeChildName };
