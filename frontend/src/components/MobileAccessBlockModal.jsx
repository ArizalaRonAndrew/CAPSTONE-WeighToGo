import { useEffect } from "react";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";

// Modal shown when an MNAO user attempts to log in from a mobile device or
// mobile viewport. Credentials may be valid, but the MNAO portal is
// desktop-only, so login is blocked and this message is shown instead of
// redirecting to the dashboard.
export default function MobileAccessBlockModal({ onClose }) {
  useLockBodyScroll();

  // Close on Escape key while the modal is mounted.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay mobile-block-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mnao-mobile-block-title"
      aria-describedby="mnao-mobile-block-desc"
      onClick={onClose}
    >
      <div className="modal-card mobile-access-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close mobile-block-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="mobile-block-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="56" height="56">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <div className="mobile-block-badge">Not supported</div>
        </div>

        <div className="mobile-block-body">
          <h2 id="mnao-mobile-block-title" className="mobile-block-title">
            MNAO portal is desktop-only
          </h2>
          <p id="mnao-mobile-block-desc" className="mobile-block-desc">
            You&apos;re signing in with a Municipal Nutrition Action Officer
            (MNAO) account, which is not accessible on mobile devices or mobile
            viewports — even with the correct credentials.
          </p>
          <p className="mobile-block-hint">
            Please open WeighToGo on a desktop or laptop computer to access the
            MNAO pages.
          </p>

          <button
            type="button"
            className="btn mobile-block-btn"
            onClick={onClose}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
