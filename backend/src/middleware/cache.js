const crypto = require("crypto");
const redis = require("../config/redis");

// Server-side GET response cache (Phase A).
//
// Scope includes role + barangay + user id so a BNS can never be served
// another barangay's roster, and two users on a shared office computer can
// never share a cached row. Query params are hashed into the key in stable
// (sorted) order so ?month=X&barangay=Y hits the same entry regardless of
// param order.
//
// Deliberately does NOT touch the `Cache-Control: no-store` header app.js
// sets: that header protects the browser/bfcache on shared computers, while
// this cache only makes the server answer faster (signalled via X-Cache).
// Must run AFTER `authenticate` — it needs req.user for scoping.

function scopeFor(req) {
  const role = req.user?.role || "anon";
  const barangay = req.user?.assigned_barangay || "all";
  const userId = req.user?.id || "anon";
  return `${role}:${barangay}:${userId}`;
}

function queryHash(query) {
  const keys = Object.keys(query || {}).sort();
  const stable = keys.map((k) => `${k}=${JSON.stringify(query[k])}`).join("&");
  return crypto.createHash("sha1").update(stable).digest("hex").slice(0, 12);
}

function cacheKey(tag, req) {
  return `${tag}:${scopeFor(req)}:${queryHash(req.query)}`;
}

function cacheGet(tag, ttlSeconds) {
  return async (req, res, next) => {
    if (req.method !== "GET") return next();
    if (!redis.isEnabled()) return next();

    const key = cacheKey(tag, req);
    const hit = await redis.getJson(key);
    if (hit !== null && hit !== undefined) {
      res.set("X-Cache", "HIT");
      return res.json(hit);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Only cache successful JSON bodies — never errors, 404s, or empties.
      if (res.statusCode === 200 && body !== undefined) {
        redis.setJson(key, body, ttlSeconds);
      }
      res.set("X-Cache", "MISS");
      return originalJson(body);
    };
    next();
  };
}

module.exports = { cacheGet, cacheKey, scopeFor, queryHash };
