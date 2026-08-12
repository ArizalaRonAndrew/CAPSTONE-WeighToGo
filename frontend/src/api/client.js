// Empty by default: relative "/api" works both in local dev (Vite's proxy in
// vite.config.js forwards it to the backend, making it same-origin from the
// browser's perspective) and in production if the frontend is served from
// the same origin as the backend. If they're ever deployed to different
// hosts (which the backend's CORS_ORIGIN/credentials config already
// anticipates), set VITE_API_BASE_URL to the backend's absolute URL — see
// frontend/.env.example.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// AuthContext registers a handler here on mount so a 401 from ANY API call
// (not just the ones AuthContext itself makes) clears the session right
// away. Without this, an expired/revoked session just produced increasingly
// wrong or empty data on every page for the rest of the visit, with nothing
// telling the user they needed to log back in — ProtectedRoute already
// redirects to /login the moment the session's `user` becomes null, so
// clearing it here is all that's needed to close the loop.
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    // Required for the httpOnly session cookie to actually be sent/received
    // once frontend and backend are on different origins — without this,
    // every authenticated call 401s despite login appearing to succeed.
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (res.status === 401) {
    onUnauthorized?.();
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};
