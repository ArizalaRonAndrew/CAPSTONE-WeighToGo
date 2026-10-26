import { createContext, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import { purgeApiCache } from "../utils/pwaCache";
import { loadRevGated } from "../hooks/useRevReport";
import { addMonths, currentMonth } from "../utils/month";
import { clearLastRoute } from "../utils/lastRoute";
import {
  setSessionUserId,
  saveLastKnownUser,
  getLastKnownUser,
  clearOfflineUserData,
} from "../utils/outbox";

const AuthContext = createContext(null);

// Bumped by the logout background cleanup: if a new session starts while a
// previous logout's cleanup tasks are still in flight, the stale generation
// aborts rather than wiping the new session's freshly-populated caches.
let logoutGeneration = 0;

// The in-flight local wipe from the last session teardown. Login awaits it so
// an offline page refresh can never race a logout and resurrect the session
// from the cached profile, while a fast re-login never loses its own record.
let logoutCleanup = Promise.resolve();

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
            loadRevGated(`/reports/trends?from=${year}-01&to=${year}-12&indicator=all`, trendMonths),
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

  // Tear down the local session and wipe everything that could let a later
  // offline boot restore it. Shared by explicit logout and by a server 401
  // (expired/revoked session) so the cached profile can never outlive the
  // session it was saved for. UI state is cleared synchronously; the actual
  // wipes start right away rather than waiting on a network call that may
  // hang on a dead connection.
  function endLocalSession() {
    setUser(null);
    setOfflineMode(false);
    setSessionUserId(null);
    // Don't resume the ended session's page on the next PWA relaunch/login.
    clearLastRoute();

    const gen = ++logoutGeneration;
    logoutCleanup = (async () => {
      if (gen !== logoutGeneration) return;
      // Drop the cached profile first — it is what offline boot reads.
      await clearOfflineUserData();
      if (gen !== logoutGeneration) return;
      await purgeApiCache();
    })();
    logoutCleanup.catch(() => {});
  }

  useEffect(() => {
    let alive = true;

    // Offline page refresh / app relaunch: the browser could not prove the
    // session against the server, so resume the last profile the server did
    // verify (written on login and on every successful /users/me). Reads are
    // served from the offline cache, writes remain gated by the outbox's own
    // expiry check, and a genuine 401 still logs out. Without this, every
    // refresh on a field device bounced an authenticated user back to /login.
    async function restoreCachedSession() {
      const cached = await getLastKnownUser();
      if (!alive || !cached?.user) return false;
      setUser(cached.user);
      setOfflineMode(true);
      // Scope the offline queue/cache to this user before any page fetches.
      setSessionUserId(cached.user.id || null);
      return true;
    }

    async function boot() {
      try {
        // When the device already knows it has no connection, restore right
        // away instead of waiting for the fetch to fail (or hang until the
        // 20s GET timeout on a dead tunnel).
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          if (await restoreCachedSession()) return;
          if (alive) setUser(null);
          return;
        }
        const u = await api.get("/users/me");
        if (alive) applyLiveUser(u);
      } catch (err) {
        if (!alive) return;
        // Only a network failure (offline, dead tunnel, timeout) falls back
        // to the cached profile. A real HTTP 401/403 means the session is
        // gone and must land on /login.
        if (err?.network && (await restoreCachedSession())) return;
        if (alive) setUser(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    boot();
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
      // The server rejected this session — clear the cached profile too, or a
      // later refresh while offline would restore a session that no longer
      // exists. (Login's own 401 for bad credentials is harmless here: the
      // local session is already gone.)
      endLocalSession();
    });
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // A re-login invalidates any teardown from the previous session and waits
    // for its local wipe to finish before writing the new profile — otherwise
    // a still-running logout could delete the session we are creating now.
    logoutGeneration += 1;
    await logoutCleanup.catch(() => {});
    // A different user on a shared computer must never inherit the previous
    // session's cached API rows (e.g. after an expiry bounced to /login).
    setSessionUserId(loggedInUser?.id || null);
    setOfflineMode(false);
    // Keep the shared API cache purge on the critical path so a new user can
    // never see the previous user's cached rows. The IndexedDB offline-session
    // snapshot is best-effort and must not delay navigation after auth succeeds.
    await purgeApiCache();
    if (loggedInUser) saveLastKnownUser(loggedInUser, tokenExpiryMs(token));
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
    // (crucial on a shared office computer). The cached profile is wiped
    // immediately too, so refreshing offline right after logout cannot
    // restore the session.
    endLocalSession();

    // Best-effort token revocation runs in the background and no longer gates
    // navigation. The HTTP session cookie is still cleared server-side; a
    // failed call degrades to the cookie being cleared here plus natural JWT
    // expiry, as before.
    (async () => {
      try {
        await api.post("/users/logout");
      } catch {
        /* server unreachable — nothing more to do about it */
      }
    })();
  }

  return (
    <AuthContext.Provider value={{ user, loading, offlineMode, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
