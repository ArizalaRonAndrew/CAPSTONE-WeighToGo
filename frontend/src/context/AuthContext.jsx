import { createContext, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import { purgeApiCache } from "../utils/pwaCache";
import {
  setSessionUserId,
  saveLastKnownUser,
  clearOfflineUserData,
} from "../utils/outbox";

const AuthContext = createContext(null);

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
    await purgeApiCache();
    setSessionUserId(loggedInUser?.id || null);
    setOfflineMode(false);
    if (loggedInUser) saveLastKnownUser(loggedInUser, tokenExpiryMs(token));
    setUser(loggedInUser);
    return loggedInUser;
  }

  async function logout() {
    // Session must be cleared client-side even if the server call fails
    // (offline, server error) — otherwise a failed logout silently leaves
    // the UI authenticated with no indication anything went wrong, which
    // matters most on a shared office computer.
    try {
      await api.post("/users/logout");
    } finally {
      // Purge even when offline: Cache Storage is local, so the previous
      // user's cached rows are wiped regardless of connectivity.
      await purgeApiCache();
      await clearOfflineUserData();
      setSessionUserId(null);
      setOfflineMode(false);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, offlineMode, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
