const redis = require("../config/redis");

// Idempotency-Key support for creation endpoints (Phase C: offline outbox).
//
// A phone that loses signal mid-submit (or a service-worker background-sync
// replay racing the page's own flush) can send the same creation twice. The
// client stamps every mutation with a uuid `Idempotency-Key` header; the
// first 2xx response is stored in Redis for 24h keyed by user + key, and any
// repeat delivers the identical status + body with `X-Replayed: true`
// instead of creating a second row.
//
// Only 2xx responses are stored — 4xx/409s (validation, duplicate-month)
// always surface fresh so the client can reconcile them. Fail-open: without
// Redis or without the header, requests pass straight through.

const IDEM_TTL_SECONDS = 24 * 60 * 60;

function idemKey(userId, key) {
  return `idem:${userId || "anon"}:${key}`;
}

function idempotency() {
  return async (req, res, next) => {
    const key = req.headers["idempotency-key"];
    if (!key || typeof key !== "string" || !key.trim()) return next();
    if (!redis.isEnabled()) return next();

    const rkey = idemKey(req.user?.id, key.trim());
    const stored = await redis.getJson(rkey);
    if (stored && typeof stored.status === "number" && stored.body !== undefined) {
      res.set("X-Replayed", "true");
      return res.status(stored.status).json(stored.body);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body !== undefined) {
        redis.setJson(rkey, { status: res.statusCode, body }, IDEM_TTL_SECONDS);
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { idempotency, idemKey, IDEM_TTL_SECONDS };
