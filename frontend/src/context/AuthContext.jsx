import { createContext, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import { purgeApiCache } from "../utils/pwaCache";
import { loadRevGated } from "../hooks/useRevReport";
import { addMonths, currentMonth } from "../utils/month";
import {
  setSessionUserId,
  saveLastKnownUser,
  clearOfflineUserData,
} from "../utils/outbox";

const AuthContext = createContext(null);

// Bumped by the logout background cleanup: if a new session starts while a
// previous logout's cleanup tasks are still in flight, the stale generation
// aborts rather than wiping the new session's freshly-populated caches.
let logoutGeneration = 0;

// After a successful login, warm the rev-gated data cache for the landing
// page while React is still mounting it. loadRevGated stores the exact same
// snapshot the landing page reads (keyed by user + URL, see reportCache.js),
// so a user on a slow field network lands on an already-loaded screen instead
// of watching "Loading..." after the button unblocks. Steps duplicate the
// URL construction the page performs on mount — /pages/Masterlist.jsx for BNS
// and /pages/admin/HealthTrends.jsx for MNAO.
// Fire-and-forget: failures here are exactly the page's normal fetch path,
// and a duplicate in-flight GET only costs one identical request.
function prefetchLandingData(role) {
  try {
    const month = currentMonth();
    const year = month.slice(0, 4);
    const trendMonths = Array.from(
      { length: 12 },
      (_, i) => addMonths(`${year}-01`, i)
    );
    const jobs =
      role === "MNAO"
        ? [
            loadRevGated(`/reports/trends?from=${year}-01&to=${year}-12&indicator=wfa`, trendMonths),
            loadRevGated(`/reports/barangay-comparison?month=${month}`, [month]),
          ]
        : [loadRevGated("/children", [month]), loadRevGated("/assessments", [month])];
    Promise.allSettled(jobs);
  } catch {
    // Prefetch is best-effort — the page refetches on mount regardless.
  }
}

// JWT exp (seconds epoch) without verifying — expiry display/gating only,
// the server remains the sole verifier.
function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(atob(String(token).split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when working from the cached profile without a live session check
  // (offline boot, or connection dropped mid-visit). Reads come from saved
  // copies, writes queue — and the server revalidates everything on sync.
  const [offlineMode, setOfflineMode] = useState(false);

  function applyLiveUser(u) {
    setUser(u);
    setOfflineMode(false);
    // Scope the offline queue/cache to this user.
    setSessionUserId(u?.id || null);
    if (u) saveLastKnownUser(u);
  }

  useEffect(() => {
    let alive = true;
    api
      .get("/users/me")
      .then((u) => {
        if (alive) applyLiveUser(u);
      })
      .catch(() => {
        // Login requires internet: no cached profile may stand in for a
        // session here, offline boot included. A live in-memory session that
        // loses connectivity keeps working (offlineMode) — but a fresh page
        // load must prove the session against the server first.
        if (alive) setUser(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catches a session going invalid mid-visit (expired token, or an admin
  // deactivating this account) from any API call anywhere in the app, not
  // just the ones this context makes directly.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setOfflineMode(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Revalidate the session whenever connectivity returns — a cached
  // offline profile upgrades to live (or drops to login on 401) without a
  // manual refresh. Network failures mid-revalidation keep the cached user.
  useEffect(() => {
    function handleOnline() {
      api
        .get("/users/me")
        .then((u) => applyLiveUser(u))
        .catch((err) => {
          if (!err.network) setUser(null);
        });
    }
    function handleOffline() {
      setOfflineMode(true);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The browser back/forward button can restore this page from bfcache —
    // a frozen snapshot of the React tree from before logout, served without
    // re-running any of our code. `pageshow` fires on that restore, so this
    // re-checks the real session and clears `user` if it's gone, instead of
    // letting the stale authenticated UI sit on screen.
    function handlePageShow(event) {
      if (!event.persisted) return;
      api
        .get("/users/me")
        .then((u) => applyLiveUser(u))
        // A bfcache restore while offline must keep the cached session, not
        // wipe it — only a real 401 logs out here.
        .catch((err) => {
          if (!err.network) setUser(null);
        });
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function login(email, password) {
    const { user: loggedInUser, token } = await api.post("/users/login", { email, password });
    // A different user on a shared computer must never inherit the previous
    // session's cached API rows (e.g. after an expiry bounced to /login).
    setSessionUserId(loggedInUser?.id || null);
    setOfflineMode(false);
    // Purge (Cache Storage) and the IndexedDB session write used to run
    // back-to-back after the login POST; they're independent local ops, so
    // run them in parallel — navigation waits on the slower one, not their sum.
    await Promise.all([
      purgeApiCache(),
      loggedInUser && saveLastKnownUser(loggedInUser, tokenExpiryMs(token)),
    ]);
    // Start fetching what the landing screen needs before navigation even
    // renders it (fire-and-forget — see prefetchLandingData above).
    prefetchLandingData(loggedInUser?.role);
    setUser(loggedInUser);
    return loggedInUser;
  }

  function logout() {
    // Wipe the local session synchronously, BEFORE anything network-bound —
    // the UI drops back to /login on the next render, so a hung/failed
    // logout request can never leave an authenticated screen showing
    // (crucial on a shared office computer).
    setUser(null);
    setOfflineMode(false);
    setSessionUserId(null);

    // Security cleanup keeps running in the background and no longer gates
    // navigation: this used to await the revocation POST plus two local
    // cache wipes before returning, which is the delay felt when logging
    // out. The HTTP session cookie is still cleared server-side; only its
    // await moved off the critical path.
    const gen = ++logoutGeneration;
    (async () => {
      // Best-effort token revocation — a failed call degrades to the
      // cookie being cleared here plus natural JWT expiry, as before.
      try {
        await api.post("/users/logout");
      } catch {
        /* server unreachable — nothing more to do about it */
      }
      // If someone logged back in while revocation was in flight, that
      // login's own purge already rescoped the caches — don't wipe them.
      if (gen !== logoutGeneration) return;
      await purgeApiCache();
      await clearOfflineUserData();
    })();
  }

  return (
    <AuthContext.Provider value={{ user, loading, offlineMode, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
