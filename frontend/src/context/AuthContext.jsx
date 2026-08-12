import { createContext, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/users/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Catches a session going invalid mid-visit (expired token, or an admin
  // deactivating this account) from any API call anywhere in the app, not
  // just the ones this context makes directly.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
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
        .then(setUser)
        .catch(() => setUser(null));
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  async function login(email, password) {
    const { user: loggedInUser } = await api.post("/users/login", { email, password });
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
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
