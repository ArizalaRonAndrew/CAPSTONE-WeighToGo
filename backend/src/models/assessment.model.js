const supabase = require("../config/supabase");
const { applyStatusFilter, fetchAllPages } = require("./queryHelpers");

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
  return fetchAllPages(() => {
    let query = supabase.from(TABLE_NAME).select("*");
    if (childId) query = query.eq("child_id", childId);
    if (childIds) query = query.in("child_id", childIds);
    query = applyStatusFilter(query, status);
    return query.order("date_measured", { ascending: false });
  });
}

async function findAllWithBarangay({ childId, childIds, status } = {}) {
  requireSupabase();
  return fetchAllPages(() => {
    let query = supabase.from(TABLE_NAME).select("*, tbl_children(barangay)");
    if (childId) query = query.eq("child_id", childId);
    if (childIds) query = query.in("child_id", childIds);
    query = applyStatusFilter(query, status);
    return query.order("date_measured", { ascending: false });
  });
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
    .insert({
      child_id,
      date_measured,
      weight,
      height,
      age_in_months,
      wfa_status,
      hfa_status,
      wfl_h_status,
      submission_status: "draft",
    })
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

// Cascades a child's deletion to their assessment history so a deleted
// child's checkups stop counting in reports/the Barangay Map, which already
// filter on status='active'.
async function rejectAllForChild(childId) {
  requireSupabase();
  const { error } = await supabase.from(TABLE_NAME).update({ status: "reject" }).eq("child_id", childId);
  if (error) throw error;
}

// Marks every draft assessment for the given children within [start, end)
// as submitted, so the admin side can pick it up.
async function submitForChildren({ childIds, start, end }) {
  requireSupabase();
  if (!childIds.length) return [];
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ submission_status: "submitted" })
    .in("child_id", childIds)
    .gte("date_measured", start)
    .lt("date_measured", end)
    .eq("status", "active")
    .select("*");
  if (error) throw error;
  return data;
}

// Returns the subset of childIds that have at least one submitted, active
// assessment. Used to keep admins from seeing a child at all until the
// assigned BNS has submitted a checkup for them.
async function findSubmittedChildIds(childIds) {
  requireSupabase();
  if (!childIds.length) return new Set();
  const rows = await fetchAllPages(() =>
    supabase
      .from(TABLE_NAME)
      .select("child_id")
      .in("child_id", childIds)
      .eq("submission_status", "submitted")
      .eq("status", "active")
      .order("child_id", { ascending: true })
  );
  return new Set(rows.map((row) => row.child_id));
}

module.exports = {
  findAll,
  findAllWithBarangay,
  findById,
  create,
  update,
  softDelete,
  rejectAllForChild,
  submitForChildren,
  findSubmittedChildIds,
};
