// Records default to status='active' in list queries so soft-deleted
// ('reject') rows stay hidden unless a caller explicitly asks for them
// (status: 'reject') or opts out of filtering entirely (status: 'all').
function applyStatusFilter(query, status) {
  if (status === "all") return query;
  return query.eq("status", status || "active");
}

module.exports = { applyStatusFilter };
