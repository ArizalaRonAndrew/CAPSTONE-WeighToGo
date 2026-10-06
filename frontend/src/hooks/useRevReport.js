import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { getReportSnapshot, setReportSnapshot, revsMatch } from "../utils/reportCache";

export function formatUpdatedAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * One-shot rev-gated fetch for event-driven callers (no hook state): returns
 * the cached snapshot when revisions match, otherwise fetches fresh. Throws
 * only when there is nothing cached to fall back on.
 */
export async function loadRevGated(url, months, opts = {}) {
  const monthList = months || [];
  const force = Boolean(opts.force);
  const snapshot = force ? null : await getReportSnapshot(url);
  try {
    const sync = await api.get(`/reports/sync-status?months=${monthList.join(",")}`);
    const fresh = force ? null : snapshot || (await getReportSnapshot(url));
    const dayRolled =
      opts.daySensitive &&
      fresh?.savedAt &&
      new Date(fresh.savedAt).toDateString() !== new Date().toDateString();
    if (fresh && !dayRolled && revsMatch(fresh.rev, sync, monthList)) {
      return { body: fresh.body, fromCache: true, savedAt: fresh.savedAt };
    }
    const body = await api.get(url);
    const rev = { global: sync.global, months: sync.revs };
    await setReportSnapshot(url, body, rev);
    return { body, fromCache: false, savedAt: Date.now() };
  } catch (err) {
    const fallback = snapshot || (await getReportSnapshot(url));
    if (fallback) {
      return { body: fallback.body, fromCache: true, savedAt: fallback.savedAt, offline: true };
    }
    throw err;
  }
}

/**
 * Rev-gated report fetch: renders the cached snapshot instantly (no spinner
 * on revisit), then fires one tiny sync-status request — the heavy endpoint
 * refetches ONLY when revision counters moved. `months` scopes which
 * counters gate this URL. `refresh()` forces a refetch, keeping old data
 * visible meanwhile.
 *
 * `opts.daySensitive` is for date-derived lists (e.g. due supplements): a
 * snapshot from a previous calendar day still renders instantly but always
 * refetches, since aging into a window bumps no revision counter.
 */
export function useRevReport(url, months, opts = {}) {
  const monthsKey = (months || []).join(",");
  const daySensitive = Boolean(opts.daySensitive);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const alive = () => id === reqId.current;
      setError("");
      const monthList = monthsKey ? monthsKey.split(",") : [];

      if (!force) {
        const snapshot = await getReportSnapshot(url);
        if (!alive()) return;
        if (snapshot) {
          setData(snapshot.body);
          setUpdatedAt(snapshot.savedAt);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setRefreshing(true);
      }

      try {
        const res = await loadRevGated(url, monthList, { force, daySensitive });
        if (!alive()) return;
        setData(res.body);
        setUpdatedAt(res.savedAt);
      } catch (err) {
        if (!alive()) return;
        // Error only when there is genuinely nothing to show — otherwise the
        // instant snapshot above stands, and the OfflineBanner already
        // explains connectivity problems.
        const fallback = await getReportSnapshot(url);
        if (!alive()) return;
        if (fallback) {
          setData(fallback.body);
          setUpdatedAt(fallback.savedAt);
        } else {
          setError(err.message || "Failed to load report data");
        }
      } finally {
        if (alive()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, monthsKey, daySensitive]
  );

  useEffect(() => {
    load(false);
    return () => {
      reqId.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, refreshing, error, updatedAt, refresh };
}
