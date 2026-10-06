import { idbPut, idbGet } from "./offlineDb.js";
import { getSessionUserId } from "./outbox.js";

// Rev-gated report cache (Phase: fast Health Trends).
//
// Heavy report payloads are snapshotted in the shared readCache store along
// with the revision counters from GET /reports/sync-status. On revisit the
// page renders the snapshot instantly and fires ONE tiny sync-status request:
// revs unchanged → no refetch at all ("reloads only when there's new data").
// Revs unknown (no Redis) → always refetch, i.e. today's behavior.
//
// Rows pre-dating the rev field (saved by the generic offline cache) count
// as misses: they revalidate once, then store revs like everything else.

// Own key namespace (REPORT, not GET): generic offline saves must never
// clobber a snapshot's revs, and rev mismatch — not prefix-busting — is what
// invalidates these (every write bumps the counters).
function snapshotKey(url) {
  const userId = getSessionUserId() || "anon";
  return `${userId} REPORT ${url}`;
}

export async function getReportSnapshot(url) {
  try {
    const row = await idbGet("readCache", snapshotKey(url));
    if (!row || row.body === undefined || !row.rev) return null;
    return { body: row.body, rev: row.rev, savedAt: row.savedAt || null };
  } catch {
    return null;
  }
}

export async function setReportSnapshot(url, body, rev) {
  if (body === undefined) return;
  try {
    await idbPut("readCache", { key: snapshotKey(url), body, savedAt: Date.now(), rev });
  } catch {
    // cache is best-effort
  }
}

// True only when both snapshots carry real (numeric-global) revs that match
// on global and every requested month. Anything else means "refetch".
export function revsMatch(cachedRev, fresh, months) {
  if (!cachedRev || typeof cachedRev.global !== "number") return false;
  if (!fresh || typeof fresh.global !== "number") return false;
  if (cachedRev.global !== fresh.global) return false;
  for (const m of months || []) {
    if ((cachedRev.months?.[m] ?? null) !== (fresh.revs?.[m] ?? null)) return false;
  }
  return true;
}
