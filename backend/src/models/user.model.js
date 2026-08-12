const supabase = require("../config/supabase");
const { fetchAllPages } = require("./queryHelpers");

const TABLE_NAME = "tbl_users";
const PUBLIC_COLUMNS = "id, email, role, assigned_barangay, status, created_at";

function requireSupabase() {
  if (!supabase) {
    const err = new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env.");
    err.status = 503;
    throw err;
  }
}

async function findAll({ status } = {}) {
  requireSupabase();
  return fetchAllPages(() => {
    let query = supabase.from(TABLE_NAME).select(PUBLIC_COLUMNS);
    if (status) query = query.eq("status", status);
    return query.order("created_at", { ascending: false });
  });
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

// JWTs are stateless, so there's no server-side session row to delete on
// logout. token_version is the DB-backed equivalent: every token embeds the
// version it was issued under, and `authenticate` rejects any token whose
// version doesn't match the current one. Bumping it on logout invalidates
// that token (and any other still-valid token for that user) immediately,
// without waiting for its natural JWT expiry.
// Returns undefined if the token_version column hasn't been migrated in yet,
// so callers can fail open instead of locking every user out.
async function getTokenVersion(id) {
  requireSupabase();
  const { data, error } = await supabase.from(TABLE_NAME).select("token_version").eq("id", id).single();
  if (error) {
    if (error.code === "42703") return undefined; // column not migrated yet
    throw error;
  }
  return data?.token_version ?? 0;
}

async function bumpTokenVersion(id) {
  requireSupabase();
  const current = await getTokenVersion(id);
  if (current === undefined) return; // column not migrated yet — nothing to bump
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ token_version: current + 1 })
    .eq("id", id);
  if (error) throw error;
}

module.exports = { findAll, findById, findByEmail, updateStatus, getTokenVersion, bumpTokenVersion };
