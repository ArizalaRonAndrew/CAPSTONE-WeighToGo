// Redis cache client (Phase A: server-side response + token_version cache).
//
// Redis is cache-only, never source of truth. Every helper here fails open:
// if Redis is unreachable, disabled, or any command errors, callers get
// null/false and fall through to Supabase as if caching didn't exist. The
// app must boot and serve correctly on a host with no redis-server at all.

const KEY_PREFIX = "wtg:v1:";
const TOKEN_VERSION_TTL = 60; // seconds

let Redis = null;
try {
  // Lazy require so a missing/broken install can't break unrelated imports.
  Redis = require("ioredis");
} catch (err) {
  console.warn("[redis] ioredis is not installed. Caching is disabled.");
}

function isEnabled() {
  if (!Redis) return false;
  if (process.env.REDIS_ENABLED === "0" || process.env.REDIS_ENABLED === "false") return false;
  return true;
}

let client = null;
let warnedDown = false;

function getClient() {
  if (!isEnabled()) return null;
  if (client) return client;
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  client = new Redis(url, {
    // Never queue commands while disconnected — fail the command fast so
    // requests fall through to Supabase instead of hanging on Redis.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    // Keep retrying in the background (same-server setup: a restart shouldn't
    // permanently disable caching), but requests never wait on it.
    retryStrategy(times) {
      if (!warnedDown) {
        warnedDown = true;
        console.warn("[redis] unreachable, running without cache (will retry in background).");
      }
      return Math.min(times * 200, 5000);
    },
  });
  client.on("ready", () => {
    warnedDown = false;
  });
  // ioredis emits 'error' on every failed attempt — swallow it (we already
  // warn once via retryStrategy) so it never becomes an unhandled error.
  client.on("error", () => {});
  return client;
}

async function getJson(key) {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(KEY_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setJson(key, value, ttlSeconds) {
  const c = getClient();
  if (!c) return false;
  try {
    const raw = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await c.set(KEY_PREFIX + key, raw, "EX", ttlSeconds);
    } else {
      await c.set(KEY_PREFIX + key, raw);
    }
    return true;
  } catch {
    return false;
  }
}

async function delKeys(keys) {
  const c = getClient();
  if (!c || !keys.length) return 0;
  try {
    return await c.del(keys.map((k) => KEY_PREFIX + k));
  } catch {
    return 0;
  }
}

// Deletes every key matching `pattern` (without the global prefix), in small
// batches. Used for coarse invalidation, e.g. bust("reports:*") after any
// assessment write. SCAN-based so it never blocks the server.
async function bust(pattern) {
  const c = getClient();
  if (!c) return 0;
  try {
    let cursor = "0";
    let deleted = 0;
    const match = KEY_PREFIX + pattern;
    do {
      const [next, keys] = await c.scan(cursor, "MATCH", match, "COUNT", 200);
      cursor = next;
      if (keys.length) {
        deleted += await c.unlink(keys);
      }
    } while (cursor !== "0");
    return deleted;
  } catch {
    return 0;
  }
}

async function bustAll(patterns) {
  if (!patterns || !patterns.length) return 0;
  const results = await Promise.all(patterns.map((p) => bust(p)));
  return results.reduce((a, b) => a + b, 0);
}

function tokenVersionKey(userId) {
  return `session:token_version:${userId}`;
}

async function getCachedTokenVersion(userId) {
  return getJson(tokenVersionKey(userId));
}

// ---- data revision counters (rev-gated report cache) ----
//
// `rev:global` bumps on any data write; `rev:month:YYYY-MM` bumps only when
// that month's tallies could have changed. Clients snapshot these alongside
// cached report payloads and skip refetching while they match — one tiny
// request per page visit instead of multi-thousand-row scans. Plain INCR
// counters (no TTL): monotonic, tiny, and meaningless if lost (a flush just
// makes every client refetch once).
function revMonthKey(month) {
  return `rev:month:${month}`;
}

async function touchRevs(months = []) {
  const c = getClient();
  if (!c) return false;
  try {
    const pipe = c.pipeline();
    pipe.incr(KEY_PREFIX + "rev:global");
    for (const m of months) {
      if (/^\d{4}-\d{2}$/.test(m || "")) pipe.incr(KEY_PREFIX + revMonthKey(m));
    }
    await pipe.exec();
    return true;
  } catch {
    return false;
  }
}

async function getRevs(months = []) {
  const c = getClient();
  if (!c) return null;
  try {
    const keys = ["rev:global", ...months.filter((m) => /^\d{4}-\d{2}$/.test(m || "")).map(revMonthKey)];
    const pipe = c.pipeline();
    for (const k of keys) pipe.get(KEY_PREFIX + k);
    const results = await pipe.exec();
    const values = results.map(([err, val]) => (err || val === null ? null : Number(val)));
    const out = { global: values[0], months: {} };
    keys.slice(1).forEach((k, i) => {
      out.months[k.slice("rev:month:".length)] = values[i + 1];
    });
    return out;
  } catch {
    return null;
  }
}

async function setCachedTokenVersion(userId, version) {
  return setJson(tokenVersionKey(userId), version, TOKEN_VERSION_TTL);
}

async function delCachedTokenVersion(userId) {
  return delKeys([tokenVersionKey(userId)]);
}

module.exports = {
  isEnabled,
  getClient,
  getJson,
  setJson,
  delKeys,
  bust,
  bustAll,
  TOKEN_VERSION_TTL,
  getCachedTokenVersion,
  setCachedTokenVersion,
  delCachedTokenVersion,
  touchRevs,
  getRevs,
};

// Connect eagerly at boot so the first real request doesn't pay the TCP +
// handshake race (commands issued while still connecting fail fast by
// design). Fail-open still covers a down server.
if (isEnabled()) {
  try {
    getClient();
  } catch {
    // connection happens in the background; requests fall through meanwhile
  }
}
