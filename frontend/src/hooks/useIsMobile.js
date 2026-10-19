import { useState, useEffect } from "react";

// The MNAO portal is desktop-only. A device counts as mobile when either the
// viewport is in the mobile range or the user agent reports a mobile/tablet
// device. The 700px breakpoint mirrors Masterlist's desktop cutoff
// (min-width: 701px), so viewports at 700px and below are treated as mobile.
const MOBILE_MAX_WIDTH = 700;

const MOBILE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

/**
 * Returns true when the current device/viewport should be treated as mobile.
 * Updates reactively when the viewport is resized or rotated.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    function check() {
      const viewportMobile = window.matchMedia(
        `(max-width: ${MOBILE_MAX_WIDTH}px)`
      ).matches;
      const uaMobile = MOBILE_USER_AGENT.test(navigator.userAgent || "");
      setIsMobile(viewportMobile || uaMobile);
    }

    check();

    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
    mql.addEventListener("change", check);
    return () => mql.removeEventListener("change", check);
  }, []);

  return isMobile;
}
