import { useEffect } from "react";

// Modals render as a fixed, full-viewport overlay, but a fixed element with
// no overflow of its own does not stop wheel/touch scroll input from
// bubbling through to the page behind it — so without this, whatever table
// or list is under the modal keeps scrolling while it's open.
export function useLockBodyScroll() {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
}
