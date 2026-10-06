import { idbPut, idbGet, idbDel, idbGetAll, idbClear } from "./offlineDb.js";

// Offline outbox (Phase C): queued mutations + read cache + session memory.
//
// - Mutations that fail with a *network* error are persisted to IndexedDB and
//   flushed in seq order when connectivity returns (online/focus/interval/
//   boot/manual). HTTP errors (4xx/5xx) are never queued — they surface.
// - `readCache` holds last-good GET bodies per user, served when offline.
// - `meta:lastKnownUser` lets the app boot an offline session (Phase D).
// - `meta:tmpIdMap` remaps `tmp_<opId>` child placeholders to real ids after
//   an offline registration syncs, so dependent checkups/doses flush after it.
//
// This module never imports the api client (client.js registers its sender
// via setFlushSender) so there is no import cycle.

const TMP_PREFIX = "tmp_";
const READ_CACHE_LIMIT = 300;

let flushSender = null;
let currentUserId = null;
let flushing = false;
let statusListeners = new Set();
let lastStatus = { pending: 0, failed: 0, conflicted: 0, syncing: false, lastSyncAt: null, offline: false };

export function isQueueEnabled() {
  try {
    return import.meta.env.VITE_OFFLINE_QUEUE !== "0";
  } catch {
    return true;
  }
}

export function setFlushSender(fn) {
  flushSender = fn;
}

export function setSessionUserId(userId) {
  currentUserId = userId || null;
}

export function getSessionUserId() {
  return currentUserId;
}

export function newOpId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newIdempotencyKey() {
  return newOpId();
}

export function tmpChildId(opId) {
  return `${TMP_PREFIX}${opId}`;
}

export function isTmpId(value) {
  return typeof value === "string" && value.startsWith(TMP_PREFIX);
}

// Endpoints the outbox accepts. Auth, AI, and previews are online-only and
// must surface network errors immediately instead of queueing.
export function isQueueable(method, path) {
  const clean = String(path || "").split("?")[0];
  if (method === "POST" && clean === "/children") return true;
  if ((method === "PATCH" || method === "DELETE") && clean.startsWith("/children/")) return true;
  if (method === "POST" && clean === "/assessments") return true;
  if ((method === "PATCH" || method === "DELETE") && clean.startsWith("/assessments/")) return true;
  if (method === "POST" && clean === "/supplements") return true;
  if ((method === "PATCH" || method === "DELETE") && clean.startsWith("/supplements/")) return true;
  if (method === "POST" && clean === "/reports/submit") return true;
  return false;
}

export function entryLabel(method, path, body) {
  const clean = String(path || "").split("?")[0];
  if (clean === "/children" && method === "POST") return `Register child · ${body?.name || "unnamed"}`;
  if (clean.startsWith("/children/")) return `Edit child record`;
  if (clean === "/assessments" && method === "POST") return `New checkup · ${body?.date_measured || ""}`.trim();
  if (clean.startsWith("/assessments/")) return `Edit checkup`;
  if (clean === "/supplements" && method === "POST")
    return `Supplement dose · ${body?.supplement_type || ""} #${body?.dose_order ?? ""}`.trim();
  if (clean.startsWith("/supplements/")) return `Edit supplement record`;
  if (clean === "/reports/submit") return `Submit monthly report · ${body?.month || ""}`.trim();
  return `${method} ${clean}`;
}

export async function enqueueMutation({ method, path, body, idemKey, baseRev, userId }) {
  const opId = newOpId();
  const entry = {
    opId,
    idemKey: idemKey || newIdempotencyKey(),
    method,
    path,
    body: body === undefined ? null : body,
    baseRev: baseRev || null,
    userId: userId || currentUserId || "anon",
    label: entryLabel(method, path, body),
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    lastError: null,
    resultNote: null,
  };
  if (method === "POST" && String(path).split("?")[0] === "/children") {
    entry.tmpChildId = tmpChildId(opId);
  }
  const seq = await idbPut("outbox", entry);
  if (seq === undefined || seq === null) {
    throw new Error("Offline queue is unavailable on this device. Reconnect and try again.");
  }
  entry.seq = seq;
  await emitStatus();
  return entry;
}

// ---- read cache (last-good GETs, per user) ----

function readKey(userId, url) {
  return `${userId || "anon"} GET ${url}`;
}

export async function saveReadCache(url, body) {
  if (body === undefined) return;
  try {
    await idbPut("readCache", { key: readKey(currentUserId, url), body, savedAt: Date.now() });
    const all = await idbGetAll("readCache");
    if (all.length > READ_CACHE_LIMIT) {
      all.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
      for (const stale of all.slice(0, all.length - READ_CACHE_LIMIT)) {
        await idbDel("readCache", stale.key);
      }
    }
  } catch {
    // cache is best-effort
  }
}

export async function getReadCache(url) {
  try {
    const row = await idbGet("readCache", readKey(currentUserId, url));
    if (row) return row.body;
    return await deriveFromRoster(url);
  } catch {
    return null;
  }
}

// Full locally-stored profile for an unsynced (`tmp_…`) registration: the
// echoed form data plus any queued checkups. Lets the profile modal open
// without ever contacting the server (which would 500 on the placeholder
// id). Returns null for real ids or unknown placeholders.
export async function getOfflineChildBundle(tmpId) {
  try {
    if (!isTmpId(tmpId)) return null;
    const queued = await listEntries();
    const reg = queued.find((e) => e.tmpChildId === tmpId && e.method === "POST");
    if (!reg?.body) return null;
    const assessments = [];
    for (const e of queued) {
      if (e.method === "POST" && e.path.split("?")[0] === "/assessments" && String(e.body?.child_id) === tmpId) {
        assessments.push({
          id: `queued-${e.opId}`,
          child_id: tmpId,
          date_measured: e.body.date_measured,
          weight: e.body.weight,
          height: e.body.height,
          wfa_status: null,
          hfa_status: null,
          wfl_h_status: null,
          _queued: true,
        });
      }
    }
    assessments.sort((a, b) => String(b.date_measured || "").localeCompare(String(a.date_measured || "")));
    return { child: { ...reg.body, id: tmpId, _queued: true, _opId: reg.opId }, assessments };
  } catch {
    return null;
  }
}

// Cross-URL fallback so a child profile opens offline even when only the
// roster-level lists were ever cached (per-child URLs are cached solely on
// first open). All lookups stay inside the current user's cache scope.
async function deriveFromRoster(url) {
  try {
    const [path, qs] = String(url).split("?");
    const params = new URLSearchParams(qs || "");

    // Child profile: roster first, then an unsynced registration echo.
    const childMatch = path.match(/^\/children\/([^/]+)$/);
    if (childMatch) {
      const id = decodeURIComponent(childMatch[1]);
      const roster = await idbGet("readCache", readKey(currentUserId, "/children"));
      const found = roster?.body?.find?.((c) => String(c.id) === id);
      if (found) return found;
      if (isTmpId(id)) {
        const queued = await listEntries();
        const reg = queued.find((e) => e.tmpChildId === id && e.method === "POST");
        if (reg?.body) return { ...reg.body, id, _queued: true, _opId: reg.opId };
      }
      return null;
    }

    // Per-child checkup history: full-list filter plus queued checkups
    // (statuses unknown until sync — badges render muted "—").
    if (path === "/assessments" && params.get("childId")) {
      const cid = params.get("childId");
      const out = [];
      const all = await idbGet("readCache", readKey(currentUserId, "/assessments"));
      if (Array.isArray(all?.body)) {
        out.push(...all.body.filter((a) => String(a.child_id) === cid));
      }
      const queued = await listEntries();
      for (const e of queued) {
        if (e.method === "POST" && e.path.split("?")[0] === "/assessments" && String(e.body?.child_id) === cid) {
          out.push({
            id: `queued-${e.opId}`,
            child_id: cid,
            date_measured: e.body.date_measured,
            weight: e.body.weight,
            height: e.body.height,
            wfa_status: null,
            hfa_status: null,
            wfl_h_status: null,
            _queued: true,
          });
        }
      }
      if (!out.length) return null;
      out.sort((a, b) => String(b.date_measured || "").localeCompare(String(a.date_measured || "")));
      return out;
    }

    return null;
  } catch {
    return null;
  }
}

// GET prefixes invalidated after a kind of write flushes, mirroring the
// backend bust map (children→masterlist+map+reports, etc.).
const READ_PREFIX_BUST = {
  children: ["/children", "/barangays", "/reports"],
  assessments: ["/assessments", "/reports", "/children"],
  supplements: ["/supplements", "/reports"],
  reports: ["/reports", "/assessments", "/children"],
};

export async function bustReadCache(kind) {
  try {
    const prefixes = READ_PREFIX_BUST[kind] || [];
    if (!prefixes.length) return;
    const all = await idbGetAll("readCache");
    const mine = readKey(currentUserId, "");
    for (const row of all) {
      if (!row.key.startsWith(mine)) continue;
      const url = row.key.slice(mine.length);
      if (prefixes.some((p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"))) {
        await idbDel("readCache", row.key);
      }
    }
  } catch {
    // best-effort
  }
}

// ---- session memory (Phase D: last-known user) ----

// tokenExpMs is the JWT exp (ms epoch) when known — login returns the token
// in its response body. /users/me does not, so revalidations only refresh
// savedAt. Unknown expiry degrades to a short grace window, never forever.
export async function saveLastKnownUser(user, tokenExpMs = null) {
  try {
    await idbPut("meta", { key: "lastKnownUser", user, savedAt: Date.now(), tokenExp: tokenExpMs || null });
  } catch {
    // best-effort
  }
}

export async function getLastKnownUser() {
  try {
    const row = await idbGet("meta", "lastKnownUser");
    return row || null;
  } catch {
    return null;
  }
}

// Pure session-freshness gate (Phase D), unit-tested in isolation:
// - No cached profile at all → writes forbidden (nothing to attribute to).
// - Known JWT expiry → forbidden past exp (reads still allowed).
// - Unknown expiry (e.g. session restored via /users/me, which carries no
//   token) → short grace window from last online contact, then forbidden.
// Reads are never gated — only queueing new work is.
export const SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

export function writesAllowedOffline(cached, now = Date.now()) {
  if (!cached?.user) return { allowed: false, reason: "no-session" };
  if (cached.tokenExp && now >= cached.tokenExp) return { allowed: false, reason: "expired" };
  if (!cached.tokenExp && now - (cached.savedAt || 0) > SESSION_GRACE_MS)
    return { allowed: false, reason: "stale" };
  return { allowed: true, reason: "fresh" };
}

export async function checkOfflineWriteAllowed() {
  const cached = await getLastKnownUser();
  const { allowed, reason } = writesAllowedOffline(cached);
  if (allowed) return;
  if (reason === "no-session") {
    throw new Error("You're offline and there's no saved session on this device. Reconnect and log in first.");
  }
  throw new Error("Your session expired while offline. Reconnect to log in again — anything already saved stays queued.");
}

export async function clearOfflineUserData() {
  try {
    await idbClear("readCache");
    await idbDel("meta", "lastKnownUser");
  } catch {
    // best-effort
  }
}

// ---- status pub/sub ----

export function getOutboxStatus() {
  return { ...lastStatus };
}

export function subscribeOutbox(fn) {
  statusListeners.add(fn);
  try {
    fn(getOutboxStatus());
  } catch {
    // ignore listener errors
  }
  return () => statusListeners.delete(fn);
}

function notify(status) {
  lastStatus = status;
  for (const fn of statusListeners) {
    try {
      fn({ ...status });
    } catch {
      // ignore listener errors
    }
  }
}

export async function emitStatus() {
  try {
    const all = await idbGetAll("outbox");
    const mine = all.filter((e) => !currentUserId || e.userId === currentUserId || e.userId === "anon");
    const count = (s) => mine.filter((e) => e.status === s).length;
    const meta = await idbGet("meta", "lastSyncAt");
    notify({
      pending: count("pending") + count("blocked"),
      failed: count("failed"),
      conflicted: count("conflicted"),
      syncing: flushing,
      lastSyncAt: meta?.at || null,
      offline: lastStatus.offline,
    });
  } catch {
    // keep last known status
  }
}

export function setOfflineFlag(offline) {
  if (lastStatus.offline === offline) return;
  notify({ ...lastStatus, offline });
}

// ---- flush ----

function resolveTmpIds(value, tmpMap) {
  if (typeof value === "string" && isTmpId(value)) {
    return tmpMap[value] || value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTmpIds(v, tmpMap));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveTmpIds(v, tmpMap);
    return out;
  }
  return value;
}

async function getTmpMap() {
  try {
    const row = await idbGet("meta", "tmpIdMap");
    return row?.map || {};
  } catch {
    return {};
  }
}

async function setTmpMap(map) {
  try {
    await idbPut("meta", { key: "tmpIdMap", map });
  } catch {
    // best-effort
  }
}

function kindFor(path) {
  const clean = String(path || "").split("?")[0];
  if (clean.startsWith("/children")) return "children";
  if (clean.startsWith("/assessments")) return "assessments";
  if (clean.startsWith("/supplements")) return "supplements";
  if (clean.startsWith("/reports")) return "reports";
  return null;
}

async function updateEntry(entry, patch) {
  Object.assign(entry, patch);
  await idbPut("outbox", entry);
}

export async function flushOutbox() {
  if (flushing || !flushSender) return { flushed: 0 };
  flushing = true;
  await emitStatus();
  let flushed = 0;
  try {
    const all = await idbGetAll("outbox");
    const queue = all
      .filter((e) => (e.status === "pending" || e.status === "failed") && (!currentUserId || e.userId === currentUserId || e.userId === "anon"))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
    if (!queue.length) return { flushed: 0 };

    const tmpMap = await getTmpMap();
    // tmpChildId -> opId for registrations still in the queue.
    const pendingReg = new Map();
    for (const e of queue) {
      if (e.tmpChildId) pendingReg.set(e.tmpChildId, e);
    }

    for (const entry of queue) {
      // Dependency: an entry referencing a not-yet-synced tmp child waits —
      // whether the reference sits in the body (queued checkup/dose) or in
      // the path itself (queued edit of an unsynced registration).
      const pathRef = (entry.path.match(/tmp_[A-Za-z0-9_-]+/) || [])[0] || null;
      const bodyRef =
        entry.method === "POST" && entry.body?.child_id && isTmpId(entry.body.child_id)
          ? entry.body.child_id
          : null;
      const ref = pathRef && !tmpMap[pathRef] ? pathRef : bodyRef && !tmpMap[bodyRef] ? bodyRef : null;
      if (ref) {
        const reg = pendingReg.get(ref);
        if (!reg || reg.status === "failed" || reg.status === "conflicted") {
          await updateEntry(entry, { status: "blocked", lastError: "Waiting on a registration that did not sync." });
          continue;
        }
        // Registration is ahead in seq order — it flushes first in this run.
        if ((reg.seq || 0) > (entry.seq || 0)) {
          await updateEntry(entry, { status: "blocked", lastError: "Waiting on child registration." });
          continue;
        }
      }

      const body = resolveTmpIds(entry.body, tmpMap);
      // Paths embed the tmp id mid-string (/children/tmp_x), so they need
      // substring replacement rather than the whole-value resolve above.
      const sendPath = pathRef && tmpMap[pathRef] ? entry.path.split(pathRef).join(tmpMap[pathRef]) : entry.path;

      // Optimistic-concurrency pre-check for edits: fetch the row and compare
      // updated_at (when both sides carry it). Mismatch → user decision.
      if ((entry.method === "PATCH" || entry.method === "DELETE") && entry.baseRev) {
        try {
          const current = await flushSender({ method: "GET", path: sendPath, idemKey: null, body: null });
          const serverRev = current?.data?.updated_at || null;
          if (serverRev && serverRev !== entry.baseRev) {
            await updateEntry(entry, { status: "conflicted", lastError: "Changed on the server while you were offline." });
            continue;
          }
        } catch (err) {
          if (err && err.network) break; // went offline mid-flush
          if (err && err.status === 401) break; // session invalid — stop, surface
          if (err && err.status === 404) {
            await updateEntry(entry, { status: "failed", lastError: "Record no longer exists on the server." });
            continue;
          }
          // Any other read failure: leave pending, try next time.
          continue;
        }
      }

      await updateEntry(entry, { status: "syncing", attempts: (entry.attempts || 0) + 1 });
      try {
        const res = await flushSender({ method: entry.method, path: sendPath, body, idemKey: entry.idemKey });
        await updateEntry(entry, { status: "done", lastError: null, resultNote: res?.replayed ? "Server already had this (duplicate safely ignored)." : null });
        flushed += 1;
        // Registration produced the real id — remap dependents (this run + later).
        if (entry.tmpChildId && res?.data?.id) {
          tmpMap[entry.tmpChildId] = res.data.id;
          await setTmpMap(tmpMap);
        }
        const kind = kindFor(entry.path);
        if (kind) await bustReadCache(kind);
        // 409 on a replayed month-checkup is the server's duplicate signal —
        // treat as success-with-note, not an error loop. (Handled below in catch.)
      } catch (err) {
        if (err && err.network) {
          await updateEntry(entry, { status: "pending" });
          break; // still offline — stop the run
        }
        if (err && err.status === 401) {
          await updateEntry(entry, { status: "pending" });
          break; // session invalid — AuthContext surfaces it; retry after login
        }
        if (err && err.status === 409 && entry.method === "POST" && String(entry.path).split("?")[0] === "/assessments") {
          await updateEntry(entry, { status: "done", resultNote: "A checkup for that month already exists on the server." });
          flushed += 1;
          continue;
        }
        await updateEntry(entry, { status: "failed", lastError: err?.message || "Sync failed." });
      }
    }

    try {
      await idbPut("meta", { key: "lastSyncAt", at: Date.now() });
    } catch {
      // best-effort
    }
    // Drop completed entries so the panel only shows actionable items.
    try {
      const done = (await idbGetAll("outbox")).filter((e) => e.status === "done");
      for (const e of done) await idbDel("outbox", e.seq);
    } catch {
      // best-effort
    }
    return { flushed };
  } finally {
    flushing = false;
    await emitStatus();
  }
}

export async function retryEntry(opId) {
  try {
    const all = await idbGetAll("outbox");
    const entry = all.find((e) => e.opId === opId);
    if (entry && (entry.status === "failed" || entry.status === "blocked")) {
      await updateEntry(entry, { status: "pending", lastError: null });
    }
    await emitStatus();
  } catch {
    // ignore
  }
}

export async function resolveConflict(opId, keep) {
  // keep === 'mine': drop the stale baseRev and requeue (last-write-wins,
  // explicit user choice). keep === 'server': discard the queued edit.
  try {
    const all = await idbGetAll("outbox");
    const entry = all.find((e) => e.opId === opId);
    if (!entry || entry.status !== "conflicted") return;
    if (keep === "mine") {
      await updateEntry(entry, { status: "pending", baseRev: null, lastError: null });
    } else {
      await idbDel("outbox", entry.seq);
    }
    await emitStatus();
  } catch {
    // ignore
  }
}

export async function discardEntry(opId) {
  try {
    const all = await idbGetAll("outbox");
    const entry = all.find((e) => e.opId === opId);
    if (entry) await idbDel("outbox", entry.seq);
    await emitStatus();
  } catch {
    // ignore
  }
}

export async function listEntries() {
  try {
    const all = await idbGetAll("outbox");
    return all
      .filter((e) => e.status !== "done" && (!currentUserId || e.userId === currentUserId || e.userId === "anon"))
      .sort((a, b) => (a.seq || 0) - (b.seq || 0));
  } catch {
    return [];
  }
}

// Auto-flush triggers: back online, window focus, periodic, and boot.
export function initOutbox() {
  if (typeof window === "undefined") return () => {};
  const tryFlush = () => {
    if (navigator.onLine === false) {
      setOfflineFlag(true);
      emitStatus();
      return;
    }
    flushOutbox();
  };
  const onOnline = () => {
    setOfflineFlag(false);
    flushOutbox();
  };
  const onOffline = () => {
    setOfflineFlag(true);
    emitStatus();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryFlush();
  });
  const timer = setInterval(tryFlush, 30000);
  tryFlush(); // boot: pick up entries queued in a previous session
  emitStatus();
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    clearInterval(timer);
  };
}
