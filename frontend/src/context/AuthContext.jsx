import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

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
    await api.post("/users/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
