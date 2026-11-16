// Health Trends line-chart data + server-side stale-while-revalidate cache.
//
// The chart's GET now behaves like this:
//   1. Redis has a usable entry -> respond with it IMMEDIATELY (a few ms),
//      whether it is fresh or stale. A stale entry also kicks off a
//      background database revalidation; the next request sees the result.
//   2. No usable entry (cold cache / first ever visit) -> compute once,
//      single-flight, and store the result.
//
// Freshness is deliberately cheap to check: every write already bumps the
// `rev:global` counter in config/redis.js, so a cached entry carries the
// revision it was built from. If the counter moved (or the entry is older
// than REVALIDATE_AFTER_MS, which catches records written directly in
// Supabase), the entry is stale and gets refreshed in the background.
//
// The cache key lives under `swr:` on purpose: existing controllers call
// bustAll(["shared:trends:*"]) after writes. Deleting the only copy would put
// the next visitor back on a multi-second cold query, so this cache is NOT
// deleted on writes — the revision mismatch marks it stale while the body
// stays available as the instant fallback. It self-expires after a retention
// window as a last-resort bound.

const crypto = require("crypto");
const reportsModel = require("../models/reports.model");
const redis = require("../config/redis");
const {
  toMonthRange,
  isValidMonthString,
  periodKeyForDate,
  periodsBetween,
  addMonths,
} = require("../utils/date");
const { dedupeByChildPerPeriod } = require("../utils/periodDedupe");
const { filterSubmittedForRole } = require("../utils/submission");

const STATUS_VALUES = {
  wfa: ["Normal", "Underweight", "Severely Underweight", "Overweight"],
  hfa: ["Normal", "Stunted", "Severely Stunted", "Tall"],
  wfl_h: ["Normal", "Wasted", "Severely Wasted", "Overweight", "Obese"],
};

const INDICATOR_COLUMNS = {
  wfa: "wfa_status",
  hfa: "hfa_status",
  wfl_h: "wfl_h_status",
};

function envMs(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// How long a cached entry is considered fresh without re-querying. Kept
// short so records changed outside the API (scripts, Supabase dashboard) show
// up on their own; cache hits still answer in milliseconds either way.
const REVALIDATE_AFTER_MS = envMs("TRENDS_SWR_MAX_AGE_MS", 60 * 1000);
// Redis retention for the body/metadata. Long enough that "open the chart on
// another laptop tomorrow" is still an instant cache hit.
const RETENTION_SECONDS = Math.max(
  60,
  Math.round(Number(process.env.TRENDS_SWR_RETENTION_SECONDS) || 7 * 24 * 60 * 60)
);
// How long a stale body may still be served instantly while refreshes fail
// or are slow. Defaults to the full retention window: the chart should paint
// immediately on every laptop rather than block on a cold query. Operators
// can lower this if they prefer an error/wait over a week-old chart.
const MAX_STALE_MS = Math.max(
  REVALIDATE_AFTER_MS,
  envMs("TRENDS_SWR_MAX_STALE_MS", RETENTION_SECONDS * 1000)
);
// A stream that attaches right after the page's GET must not fire a second
// identical database query; if the entry was refreshed this recently, reuse it.
const STREAM_MIN_REVALIDATE_MS = 3000;

const KEY_TAG = "swr:trends";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Mirrors the validation the old controller performed, but throws a 400-status
// error so both the JSON route and the SSE stream can share it.
function normalizeTrendQuery(query = {}) {
  const { from, to } = query;
  const indicatorKey = query.indicator;
  const column = INDICATOR_COLUMNS[indicatorKey];
  const allIndicators = indicatorKey === "all";
  const status = query.status || null;

  if (
    !isValidMonthString(from) ||
    !isValidMonthString(to) ||
    (!column && !allIndicators) ||
    (allIndicators && status)
  ) {
    throw badRequest(
      "from, to (YYYY-MM) and a valid indicator (wfa|hfa|wfl_h|all) are required"
    );
  }

  return {
    from,
    to,
    status,
    indicator: indicatorKey,
    column,
    allIndicators,
    barangay: query.barangay || null,
  };
}

function monthsBetween(from, to) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 36) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return out;
}

// Query params are hashed in stable order; `_r` is only a cache-buster from
// manual refreshes and must not create a separate cache key.
function stableQueryHash(query = {}) {
  const stable = {};
  for (const key of Object.keys(query).sort()) {
    if (key === "_r") continue;
    stable[key] = query[key];
  }
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 16);
}

function cacheKeyFor(user, query) {
  const role = user?.role || "anon";
  const barangay = user?.assigned_barangay || "all";
  return `${KEY_TAG}:${role}:${barangay}:${stableQueryHash(query)}`;
}

function buildTrendContext(user, query) {
  const params = normalizeTrendQuery(query);
  return {
    user,
    query,
    params,
    months: monthsBetween(params.from, params.to),
    key: cacheKeyFor(user, query),
  };
}

function filterByBarangay(rows, barangay) {
  if (!barangay) return rows;
  return rows.filter((row) => row.tbl_children?.barangay === barangay);
}

// Shape used by the "Issues by Barangay" bar chart's sibling line chart. Kept
// byte-identical between the RPC fast path and the row-scan fallback so the
// client can't tell which one served the answer:
// - ?status= -> [{ month, count }]
// - default -> [{ month, <StatusA>: n, <StatusB>: n, ... }] (one key per
//   status value the frontend plots as a line), zero buckets filled.
function trendsResponseFromCounts(counts, periods, status, statuses) {
  if (status) {
    const buckets = new Map(periods.map((m) => [m, 0]));
    for (const { period, status: st, total } of counts) {
      if (st === status && buckets.has(period)) buckets.set(period, Number(total));
    }
    return periods.map((month) => ({ month, count: buckets.get(month) }));
  }
  const buckets = new Map(
    periods.map((m) => [m, Object.fromEntries(statuses.map((s) => [s, 0]))])
  );
  for (const { period, status: st, total } of counts) {
    const bucket = buckets.get(period);
    if (bucket && bucket[st] !== undefined) bucket[st] += Number(total);
  }
  return periods.map((month) => ({ month, ...buckets.get(month) }));
}

async function computeTrends({ user, query }) {
  const params = normalizeTrendQuery(query);
  const { from, to, status, indicator: indicatorKey, column, allIndicators, barangay } = params;
  const submittedOnly = user?.role === "MNAO";

  // Q1-aware range: from/to are calendar months, but Jan–Mar collapses to
  // a single "YYYY-Q1" data point since that quarter holds one assessment
  // per child. The underlying fetch still spans the full calendar range.
  const { start } = toMonthRange(from);
  const { end } = toMonthRange(to);
  const periods = periodsBetween(from, to);
  const indicatorKeys = allIndicators ? Object.keys(INDICATOR_COLUMNS) : [indicatorKey];
  const statuses = STATUS_VALUES[indicatorKey] || [];

  // Fast path: Postgres aggregates in-database (one indexed GROUP BY pass,
  // ~30 count rows transferred) instead of the full year's assessment rows
  // plus five JS tally passes. If the trend_counts() SQL function hasn't been
  // installed in Supabase yet — or errors for any reason — fall through to
  // the row scan below so the chart keeps working.
  try {
    const countSets = await Promise.all(
      indicatorKeys.map((indicator) =>
        reportsModel.fetchTrendCounts({
          start,
          end,
          indicator,
          barangay,
          submittedOnly,
        })
      )
    );
    if (allIndicators) {
      const responses = Object.fromEntries(
        indicatorKeys.map((indicator, index) => [
          indicator,
          trendsResponseFromCounts(countSets[index], periods, null, STATUS_VALUES[indicator]),
        ])
      );
      return periods.map((month, periodIndex) => ({
        month,
        ...Object.fromEntries(
          indicatorKeys.map((indicator) => [indicator, responses[indicator][periodIndex]])
        ),
      }));
    }
    const [counts] = countSets;
    return trendsResponseFromCounts(counts, periods, status, statuses);
  } catch (err) {
    console.warn("getTrends: trend_counts RPC unavailable, using row scan:", err.message);
  }

  // Row-scan fallback. The barangay + role filters now resolve in-query
  // (see fetchTrendRows) rather than after the full fetch.
  const scopedRows = filterByBarangay(
    await reportsModel.fetchTrendRows({ start, end, barangay, submittedOnly }),
    barangay
  );
  // Jan–Mar is one month: collapse to one record per (child, period) so the
  // Q1 point never sums Jan+Feb+Mar into 3x.
  const rows = dedupeByChildPerPeriod(filterSubmittedForRole({ user }, scopedRows));

  if (status) {
    const buckets = new Map(periods.map((m) => [m, 0]));
    for (const row of rows) {
      if (row[column] !== status) continue;
      const period = periodKeyForDate(row.date_measured);
      if (period && buckets.has(period)) buckets.set(period, buckets.get(period) + 1);
    }
    return periods.map((month) => ({ month, count: buckets.get(month) }));
  }

  // No status filter: break each assessment period down by every status
  // for this indicator, so the caller can plot one line per status.
  // Jan–Mar rows all land in the single "YYYY-Q1" bucket.
  if (allIndicators) {
    const buckets = new Map(
      periods.map((period) => [
        period,
        Object.fromEntries(
          indicatorKeys.map((indicator) => [
            indicator,
            Object.fromEntries(STATUS_VALUES[indicator].map((value) => [value, 0])),
          ])
        ),
      ])
    );
    for (const row of rows) {
      const period = periodKeyForDate(row.date_measured);
      const bucket = buckets.get(period);
      if (!bucket) continue;
      for (const indicator of indicatorKeys) {
        const value = row[INDICATOR_COLUMNS[indicator]];
        if (bucket[indicator][value] !== undefined) bucket[indicator][value] += 1;
      }
    }
    return periods.map((month) => ({ month, ...buckets.get(month) }));
  }

  const buckets = new Map(periods.map((m) => [m, Object.fromEntries(statuses.map((s) => [s, 0]))]));
  for (const row of rows) {
    const value = row[column];
    if (!statuses.includes(value)) continue;
    const period = periodKeyForDate(row.date_measured);
    if (period && buckets.has(period)) buckets.get(period)[value] += 1;
  }

  return periods.map((month) => ({ month, ...buckets.get(month) }));
}

// One in-flight database refresh per cache key. A room full of laptops opening
// the same chart at 9am therefore produces ONE trend query, not N.
const inFlight = new Map();

async function performRevalidation(key, ctx) {
  // Sample the revision BEFORE querying. If a write lands while the query is
  // running the cached entry keeps the old revision, so the next request
  // treats it as stale instead of freezing pre-write numbers for an hour.
  const revs = redis.isEnabled() ? await redis.getRevs(ctx.months) : null;
  const body = await computeTrends(ctx);
  const now = Date.now();
  const entry = {
    body,
    revs: {
      global: typeof revs?.global === "number" ? revs.global : null,
      months: revs?.months || {},
    },
    cachedAt: now,
    revalidatedAt: now,
  };
  await redis.setJson(key, entry, RETENTION_SECONDS);
  return entry;
}

function startRevalidation(key, ctx) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const job = performRevalidation(key, ctx);
  inFlight.set(key, job);
  job
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(key) === job) inFlight.delete(key);
    });
  return job;
}

async function revalidateNow(key, ctx, { minAgeMs = 0, force = false } = {}) {
  if (force) {
    // A forced refresh must not reuse the in-flight result of a background
    // refresh that may have sampled the database before the user's write.
    const current = inFlight.get(key);
    if (current) {
      try {
        await current;
      } catch {
        // the forced attempt below reports the real error
      }
    }
    return startRevalidation(key, ctx);
  }

  if (inFlight.has(key)) return inFlight.get(key);

  if (minAgeMs > 0) {
    const entry = await redis.getJson(key);
    if (
      entry &&
      entry.body !== undefined &&
      Date.now() - Number(entry.revalidatedAt || 0) < minAgeMs
    ) {
      return entry;
    }
  }

  return startRevalidation(key, ctx);
}

function triggerRefresh(ctx) {
  revalidateNow(ctx.key, ctx).catch((err) => {
    console.warn("[trends] background refresh failed:", err.message);
  });
}

// The JSON endpoint's whole behaviour. Returns { body, headers } so the
// controller stays a thin adapter and the SSE route can reuse the same key.
async function serveTrends({ user, query }) {
  const ctx = buildTrendContext(user, query);
  const force = query?._r !== undefined && query?._r !== null && query?._r !== "";

  if (!redis.isEnabled()) {
    return { body: await computeTrends(ctx), headers: { "X-Cache": "OFF" } };
  }

  if (!force) {
    const [entry, revs] = await Promise.all([
      redis.getJson(ctx.key),
      redis.getRevs(ctx.months),
    ]);

    if (entry && entry.body !== undefined) {
      const age = Date.now() - Number(entry.revalidatedAt || entry.cachedAt || 0);
      // Both sides null means the revision counters have never been written
      // (a brand-new Redis), so age alone decides. If either side has a real
      // counter, a mismatch — including null vs first write — means stale.
      const comparable =
        typeof entry.revs?.global === "number" || typeof revs?.global === "number";
      const revsMatch = comparable ? entry.revs?.global === revs?.global : true;
      const fresh = revsMatch && age < REVALIDATE_AFTER_MS;

      const headers = {
        "X-Cache": fresh ? "HIT" : "STALE",
        "X-Data-Revalidated-At": String(entry.revalidatedAt || entry.cachedAt || 0),
      };
      if (typeof entry.revs?.global === "number") {
        headers["X-Data-Revision"] = String(entry.revs.global);
      }

      if (fresh) return { body: entry.body, headers };

      if (age < MAX_STALE_MS) {
        // The whole point: answer now, refresh behind the response.
        triggerRefresh(ctx);
        return { body: entry.body, headers };
      }
    }
  }

  try {
    const entry = await revalidateNow(ctx.key, ctx, { force });
    return {
      body: entry.body,
      headers: {
        "X-Cache": force ? "BYPASS" : "MISS",
        "X-Data-Revalidated-At": String(entry.revalidatedAt),
        ...(typeof entry.revs?.global === "number"
          ? { "X-Data-Revision": String(entry.revs.global) }
          : {}),
      },
    };
  } catch (err) {
    // Database failed. If any retained body exists, keep the chart usable
    // rather than replacing it with an error screen.
    const entry = await redis.getJson(ctx.key);
    if (entry && entry.body !== undefined) {
      console.warn("[trends] refresh failed, serving retained body:", err.message);
      return {
        body: entry.body,
        headers: { "X-Cache": "STALE-ERROR" },
      };
    }
    throw err;
  }
}

async function getCachedTrends(key) {
  return redis.getJson(key);
}

module.exports = {
  STATUS_VALUES,
  INDICATOR_COLUMNS,
  STREAM_MIN_REVALIDATE_MS,
  normalizeTrendQuery,
  monthsBetween,
  buildTrendContext,
  computeTrends,
  serveTrends,
  revalidateNow,
  getCachedTrends,
};
