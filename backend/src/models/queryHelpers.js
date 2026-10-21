// Records default to status='active' in list queries so soft-deleted
// ('reject') rows stay hidden unless a caller explicitly asks for them
// (status: 'reject') or opts out of filtering entirely (status: 'all').
function applyStatusFilter(query, status) {
  if (status === "all") return query;
  return query.eq("status", status || "active");
}

// Page 1 asks for `count: exact` (via buildQuery({ withCount })), so the total
// row count is known immediately and every remaining page is fetched
// CONCURRENTLY instead of one-by-one. Sequential paging cost the site ~280 ms
// per round trip, which at 48k+ assessments for one year (49 pages) stacked to
// ~13.6 s server-side — long enough for the admin GET's 20 s client timeout to
// fire and present as "offline" while the line chart loaded. Callers that
// don't route the count option through (legacy `buildQuery()` contract with
// no args) still work: count comes back null and the helper walks
// sequentially exactly as before.
const PAGE_SIZE = 1000;

async function fetchAllPages(buildQuery) {
  const first = await buildQuery({ withCount: true }).range(0, PAGE_SIZE - 1);
  if (first.error) throw first.error;
  const rows = [...(first.data || [])];

  const total = first.count;
  if (typeof total !== "number") {
    // No count available (legacy builder) — sequential walk, unchanged.
    for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
      const { data, error } = await buildQuery({ withCount: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length < PAGE_SIZE) break;
      rows.push(...data);
    }
    return rows;
  }

  if (total > rows.length) {
    const rest = await Promise.all(
      Array.from(
        { length: Math.ceil(total / PAGE_SIZE) - 1 },
        (_, i) => buildQuery({ withCount: false }).range((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1)
      )
    );
    // Promise.all preserves result order, so row order matches the pages.
    for (const page of rest) {
      if (page.error) throw page.error;
      rows.push(...(page.data || []));
    }
  }
  return rows;
}

module.exports = { applyStatusFilter, fetchAllPages };
