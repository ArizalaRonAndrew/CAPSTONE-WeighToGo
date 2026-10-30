// Deletes the legacy service-worker API cache used by previous app versions.
// Current authenticated reads use the user-scoped IndexedDB cache instead.

export const API_CACHE_NAME = "wtg-api-v1";

export async function purgeApiCache() {
  try {
    if (typeof caches === "undefined" || !caches.delete) return false;
    return await caches.delete(API_CACHE_NAME);
  } catch {
    return false;
  }
}
