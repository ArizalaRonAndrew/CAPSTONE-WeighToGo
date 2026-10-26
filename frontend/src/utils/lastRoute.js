// Remembers the last in-app page so an installed PWA relaunch (start_url "/")
// can resume exactly where the user left off instead of always jumping to the
// role landing page. A normal browser refresh already keeps its URL; this only
// affects the relaunch-at-"/" path.

const STORAGE_KEY = "wtg:last-path";

// Keep in sync with the routes in App.jsx. A path that is not listed here
// falls back to the role landing page, so a stale/unknown saved path (or one
// from a different role) can never trap the router in a redirect loop.
const ROLE_PATHS = {
  BNS: ["/bns/masterlist", "/bns/vitamins", "/bns/monthly-report"],
  MNAO: ["/admin/trends", "/admin/masterlist", "/admin/reports", "/admin/map"],
};

const KNOWN_PATHS = new Set(Object.values(ROLE_PATHS).flat());

export function landingPathFor(role) {
  return role === "MNAO" ? "/admin/trends" : "/bns/masterlist";
}

export function saveLastRoute(pathname) {
  try {
    // Only real app pages are resumable — "/", /login and unknown URLs keep
    // whatever valid page was stored before.
    if (!KNOWN_PATHS.has(pathname)) return;
    localStorage.setItem(STORAGE_KEY, pathname);
  } catch {
    // Storage unavailable (private mode / quota) — fall back to the landing page.
  }
}

export function getLastRoute() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function clearLastRoute() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// Where this user should land right after boot: their last page when it
// belongs to their role, otherwise the role landing page.
export function resumePathFor(user) {
  const last = getLastRoute();
  const allowed = ROLE_PATHS[user?.role] || [];
  if (last && allowed.includes(last)) return last;
  return landingPathFor(user?.role);
}
