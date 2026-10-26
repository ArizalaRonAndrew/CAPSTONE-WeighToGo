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
 *
 * Forced fetches append a throwaway `_r` query param. The server hashes every
 * query param into its response-cache key, so this guarantees a server-cache
 * MISS right after a local write — otherwise a stale server body could be
 * saved as the new snapshot and keep resurfacing (e.g. a just-deleted child
 * or just-recorded dose reappearing on the next visit). Snapshots stay keyed
 * by the canonical URL, so normal loads are unaffected.
 */
export function bustUrl(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_r=${Date.now()}`;
}

const inFlightRevLoads = new Map();

export async function loadRevGated(url, months, opts = {}) {
  const key = JSON.stringify([
    url,
    months || [],
    Boolean(opts.force),
    Boolean(opts.daySensitive),
    Boolean(opts.alwaysRevalidate),
  ]);
  const existing = inFlightRevLoads.get(key);
  if (existing) return existing;

  const request = loadRevGatedRequest(url, months, opts);
  inFlightRevLoads.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlightRevLoads.get(key) === request) inFlightRevLoads.delete(key);
  }
}

async function loadRevGatedRequest(url, months, opts) {
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
    if (
      fresh &&
      !dayRolled &&
      !opts.alwaysRevalidate &&
      revsMatch(fresh.rev, sync, monthList)
    ) {
      return { body: fresh.body, fromCache: true, savedAt: fresh.savedAt };
    }
    const body = await api.get(force ? bustUrl(url) : url);
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
 * visible meanwhile. `opts.alwaysRevalidate` also requests the endpoint when
 * revisions match; Redis can answer the request without repeating the query.
 * Snapshots are user-scoped and keyed by the full URL, including filters,
 * so each barangay selection restores and revalidates its own chart state.
 *
 * `opts.daySensitive` is for date-derived lists (e.g. due supplements): a
 * snapshot from a previous calendar day still renders instantly but always
 * refetches, since aging into a window bumps no revision counter.
 */
export function useRevReport(url, months, opts = {}) {
  const monthsKey = (months || []).join(",");
  const daySensitive = Boolean(opts.daySensitive);
  const alwaysRevalidate = Boolean(opts.alwaysRevalidate);
  const [result, setResult] = useState({ url: null, data: null, updatedAt: null });
  const [requestState, setRequestState] = useState({
    url: null,
    loading: true,
    refreshing: false,
    error: "",
  });
  const reqId = useRef(0);

  const load = useCallback(
    async (force = false) => {
      const id = ++reqId.current;
      const alive = () => id === reqId.current;
      setRequestState((current) => ({
        url,
        loading: current.url === url ? current.loading : true,
        refreshing: force,
        error: "",
      }));
      const monthList = monthsKey ? monthsKey.split(",") : [];

      if (!force) {
        const snapshot = await getReportSnapshot(url);
        if (!alive()) return;
        if (snapshot) {
          setResult({ url, data: snapshot.body, updatedAt: snapshot.savedAt });
          setRequestState({
            url,
            loading: false,
            refreshing: false,
            error: "",
          });
        } else {
          setRequestState({
            url,
            loading: true,
            refreshing: false,
            error: "",
          });
        }
      }

      try {
        const res = await loadRevGated(url, monthList, {
          force,
          daySensitive,
          alwaysRevalidate,
        });
        if (!alive()) return;
        setResult({ url, data: res.body, updatedAt: res.savedAt });
      } catch (err) {
        if (!alive()) return;
        // Error only when there is genuinely nothing to show — otherwise the
        // instant snapshot above stands, and the OfflineBanner already
        // explains connectivity problems.
        const fallback = await getReportSnapshot(url);
        if (!alive()) return;
        if (fallback) {
          setResult({ url, data: fallback.body, updatedAt: fallback.savedAt });
        } else {
          setRequestState((current) =>
            current.url === url
              ? { ...current, error: err.message || "Failed to load report data" }
              : current
          );
        }
      } finally {
        if (alive()) {
          setRequestState((current) =>
            current.url === url
              ? { ...current, loading: false, refreshing: false }
              : current
          );
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, monthsKey, daySensitive, alwaysRevalidate]
  );

  useEffect(() => {
    load(false);
    return () => {
      reqId.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  const hasResult = result.url === url;
  const hasRequest = requestState.url === url;
  return {
    data: hasResult ? result.data : null,
    loading: hasRequest ? requestState.loading : true,
    refreshing: hasRequest ? requestState.refreshing : false,
    error: hasRequest ? requestState.error : "",
    updatedAt: hasResult ? result.updatedAt : null,
    refresh,
  };
}
