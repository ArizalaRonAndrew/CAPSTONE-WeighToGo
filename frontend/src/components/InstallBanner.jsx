import { useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";
import "./InstallBanner.css";

function InstallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden="true">
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

/**
 * Global install banner — bottom sheet on mobile, floating card on desktop.
 * - Chromium (desktop + Android): triggers the real `beforeinstallprompt`.
 * - iOS Safari: no prompt event exists, so it shows Add to Home Screen steps.
 * Hidden when already installed (standalone) or recently dismissed.
 */
export default function InstallBanner() {
  const { visible, canInstall, isIos, install, dismiss } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (!visible) return null;

  async function handleInstall() {
    setBusy(true);
    try {
      const outcome = await install();
      if (outcome === "dismissed") dismiss();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pwa-banner" role="dialog" aria-live="polite" aria-label="Install WeighToGo app">
      <div className="pwa-banner-icon" aria-hidden="true">
        <InstallIcon />
      </div>
      <div className="pwa-banner-text">
        <p className="pwa-banner-title">Install WeighToGo</p>
        <p className="pwa-banner-subtitle">
          {isIos && !canInstall
            ? "Add it to your home screen for quick offline access."
            : "Install the app for quick access and a full-screen experience."}
        </p>
        {showIosSteps && (
          <ol className="pwa-banner-steps">
            <li>
              Tap the <ShareIcon /> Share button in Safari.
            </li>
            <li>Choose “Add to Home Screen”.</li>
            <li>Tap “Add” to confirm.</li>
          </ol>
        )}
      </div>
      <div className="pwa-banner-actions">
        {canInstall ? (
          <button type="button" className="btn pwa-banner-install" onClick={handleInstall} disabled={busy}>
            {busy ? "Installing…" : "Install"}
          </button>
        ) : (
          isIos && (
            <button
              type="button"
              className="btn pwa-banner-install"
              onClick={() => setShowIosSteps((v) => !v)}
              aria-expanded={showIosSteps}
            >
              {showIosSteps ? "Hide steps" : "How to install"}
            </button>
          )
        )}
        <button type="button" className="pwa-banner-dismiss" onClick={dismiss} aria-label="Dismiss install banner">
          ✕
        </button>
      </div>
    </div>
  );
}
