// Helpers for the Phase B service-worker API cache (`wtg-api-v1`, see
// vite.config.js workbox.runtimeCaching).
//
// The runtime cache holds authenticated JSON (rosters, reports) keyed by URL.
// On a shared office computer the next person to log in must never be served
// the previous user's cached rows, so this is purged on logout AND on login
// (covers session-expiry -> new-login without an explicit logout). Cache
// Storage is local, so purging works offline too.

export const API_CACHE_NAME = "wtg-api-v1";

export async function purgeApiCache() {
  try {
    if (typeof caches === "undefined" || !caches.delete) return false;
    return await caches.delete(API_CACHE_NAME);
  } catch {
    return false;
  }
}
