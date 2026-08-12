// Records default to status='active' in list queries so soft-deleted
// ('reject') rows stay hidden unless a caller explicitly asks for them
// (status: 'reject') or opts out of filtering entirely (status: 'all').
function applyStatusFilter(query, status) {
  if (status === "all") return query;
  return query.eq("status", status || "active");
}

// PostgREST caps each response at 1000 rows and truncates silently (no
// error) rather than telling the caller more rows exist, so any list query
// that can plausibly exceed 1000 rows (e.g. every child/assessment/
// supplement across a whole municipality with no filter) must page through
// with .range() instead of trusting a single request.
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

module.exports = { applyStatusFilter, fetchAllPages };
