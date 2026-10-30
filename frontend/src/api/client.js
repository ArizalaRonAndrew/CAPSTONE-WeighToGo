// Empty by default: relative "/api" works both in local dev (Vite's dev-server
// proxy in vite.config.js) and in production when the frontend and backend
// share an origin. For separate hosts, set VITE_API_BASE_URL to the backend's
// absolute URL — see frontend/.env.example.
const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "/api";
const SESSION_TOKEN_KEY = "wtg:session-token";

export function getSessionToken() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token) {
  if (!token) throw new Error("The server did not return an authentication token.");
  try {
    if (typeof window === "undefined") throw new Error("Session storage is unavailable.");
    window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch (err) {
    throw new Error("This browser could not save the sign-in for this tab. Enable session storage and try again.", {
      cause: err,
    });
  }
}

export function clearSessionToken() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // The local React session is still cleared if storage is unavailable.
  }
}

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

function isNetworkFailure(err) {
  // fetch rejects with a TypeError on DNS/connection/offline failures —
  // never for HTTP error statuses, which resolve normally.
  return err instanceof TypeError;
}

function offlineError(message) {
  const err = new Error(message || "You appear to be offline. Reconnect and try again.");
  err.network = true;
  return err;
}

// Reads are retry-safe, so they get a timeout: field networks often HANG
// (captive portals, dead tunnels) instead of failing fast, and without this
// every loader awaited forever — eternal "Loading..." with no error and no
// offline fallback. Mutations deliberately have NO client timeout BY
// DEFAULT: aborting a POST the server already processed manufactures
// duplicates (a fresh retry would carry a fresh key); slow writes keep the
// browser default and idempotency keys cover genuine replays. Read-only,
// repeat-safe mutations (the AI explanation POST) can opt in with an
// explicit `timeoutMs` — never queueable, never replayed, so aborting can't
// manufacture anything.
let GET_TIMEOUT_MS = 20000;

// Test-only override (Vite defines no hook for this; production never calls).
export function __setGetTimeoutMs(ms) {
  GET_TIMEOUT_MS = ms;
}

// Raw fetch core. Resolves { status, data, replayed } on HTTP responses
// (ok or not); throws a `network`-flagged error when no response arrives in
// time (timeout) or at all. Shared by interactive requests and the outbox flusher.
async function rawSend({ method = "GET", path, body, idemKey, timeoutMs, authToken }) {
  // Explicit per-request timeout wins; otherwise only idempotent GETs get one.
  const effectiveTimeout = timeoutMs ?? (method === "GET" ? GET_TIMEOUT_MS : 0);
  const controller = effectiveTimeout > 0 && typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), effectiveTimeout) : null;
  let res;
  try {
    const headers = body ? { "Content-Type": "application/json" } : {};
    if (idemKey) headers["Idempotency-Key"] = idemKey;
    const token = authToken === undefined ? getSessionToken() : authToken;
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      const timedOut = offlineError("The server is taking too long to respond.");
      timedOut.timeout = true;
      timedOut.cause = err;
      throw timedOut;
    }
    if (isNetworkFailure(err)) {
      const net = offlineError();
      net.cause = err;
      throw net;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (res.status === 401) {
    // A wrong password on the login form is not an expired session — don't
    // tear down whatever session/cache the device already holds.
    const isLoginAttempt = String(path).split("?")[0] === "/users/login";
    if (!isLoginAttempt) onUnauthorized?.();
  }

  if (!res.ok) {
    const http = new Error(data?.error || `Request failed with status ${res.status}`);
    http.status = res.status;
    http.data = data;
    throw http;
  }
  return { status: res.status, data, replayed: res.headers.get("x-replayed") === "true" };
}

// Lazy outbox import (static import would be fine — outbox never imports
// this module — but dynamic keeps the offline stack out of the critical
// first-load path for browsers that never go offline).
let outboxPromise = null;
function getOutbox() {
  if (!outboxPromise) {
    outboxPromise = import("../utils/outbox.js");
  }
  return outboxPromise;
}

// Registered as the outbox flush sender: online attempts that report
// network/HTTP outcomes back instead of queueing (no recursion — enqueueing
// happens only in request() below, never here).
async function registerFlushSender() {
  try {
    const outbox = await getOutbox();
    outbox.setFlushSender(async ({ method, path, body, idemKey }) => rawSend({ method, path, body, idemKey }));
  } catch {
    // offline stack unavailable — mutations surface network errors directly
  }
}
registerFlushSender();

async function request(path, { method = "GET", body, baseRev, timeoutMs, authToken } = {}) {
  const cleanPath = String(path).split("?")[0];
  const requestToken =
    authToken === undefined ? (cleanPath === "/users/login" ? null : getSessionToken()) : authToken;
  const isSessionEndpoint = ["/users/login", "/users/me", "/users/logout"].includes(cleanPath);
  const outbox = isSessionEndpoint ? null : await getOutbox().catch(() => null);
  const queueOn = outbox?.isQueueEnabled?.() ?? false;
  const idemKey = method !== "GET" ? outbox?.newIdempotencyKey?.() : null;

  async function queueDirectly() {
    // The expiry gate runs first — an expired offline session must fail
    // loudly instead of building false hope in the queue.
    await outbox.checkOfflineWriteAllowed();
    const entry = await outbox.enqueueMutation({
      method,
      path,
      body,
      idemKey,
      baseRev: baseRev || body?.updated_at || null,
      userId: outbox.getSessionUserId(),
    });
    const queued = { _queued: true, _opId: entry.opId };
    // Registrations echo a synthetic child so the UI can keep working
    // (select it, queue checkups against its tmp id — remapped on sync).
    // created_at pins the registration instant so the offline supplement
    // backfill uses the same cutoff the server will use on sync.
    if (entry.tmpChildId) {
      return {
        ...(body || {}),
        id: entry.tmpChildId,
        _tmpChildId: entry.tmpChildId,
        created_at: new Date(entry.createdAt).toISOString(),
        ...queued,
      };
    }
    return queued;
  }

  // Placeholder ids (unsynced registrations) don't exist server-side — any
  // request touching one would 500, online or not. Queue it straight away
  // instead of a doomed round trip. Same for a device that already knows it
  // has no connection: queue immediately so an optimistic "Give" is durable
  // even if the page is closed before a doomed fetch would have failed.
  const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (
    method !== "GET" &&
    queueOn &&
    outbox.isQueueable(method, path) &&
    (definitelyOffline || outbox.isTmpId(body?.child_id) || /\/tmp_[A-Za-z0-9_-]+(\/|$|\?)/.test(path))
  ) {
    return queueDirectly();
  }

  try {
    const { data } = await rawSend({ method, path, body, idemKey, timeoutMs, authToken: requestToken });
    outbox?.setOfflineFlag?.(false);
    // Session endpoints are deliberately excluded: offline session fallback
    // is explicit via the last-known-user record (auditable, expiry-gated),
    // never an implicit generic-cache hit. The rev-check endpoint is
    // excluded too — serving it stale would freeze rev-gated pages.
    const syncStatusExcluded =
      String(path).split("?")[0].startsWith("/users/") || String(path).split("?")[0] === "/reports/sync-status";
    if (method === "GET" && outbox && !syncStatusExcluded) {
      outbox.saveReadCache(path, data);
    }
    return data;
  } catch (err) {
    if (!err.network || !outbox) throw err;
    outbox.setOfflineFlag(true);

    if (method === "GET") {
      // (Session + rev-check endpoints excluded — see save path above. This
      // also orphans any such rows cached by earlier builds.)
      const clean = String(path).split("?")[0];
      const excluded = clean.startsWith("/users/") || clean === "/reports/sync-status";
      const cached = excluded ? null : await outbox.getReadCache(path);
      if (cached !== null) return cached;
      const miss = offlineError("You're offline and there's no saved copy of this yet. Open it once online first.");
      if (err.timeout) miss.timeout = true;
      miss.cause = err;
      throw miss;
    }

    // Mutations: queue allowlisted endpoints, surface everything else.
    if (queueOn && outbox.isQueueable(method, path)) {
      return queueDirectly();
    }
    const surfaced = offlineError();
    if (err.timeout) surfaced.timeout = true;
    surfaced.cause = err;
    throw surfaced;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body, opts) =>
    request(path, { method: "POST", body, timeoutMs: opts?.timeoutMs, authToken: opts?.authToken }),
  patch: (path, body, opts) => request(path, { method: "PATCH", body, baseRev: opts?.baseRev }),
  delete: (path) => request(path, { method: "DELETE" }),
};
