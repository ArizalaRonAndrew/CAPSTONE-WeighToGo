import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "wtg-pwa-banner-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // re-show a week after dismissal

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Macintosh — detect via touch support instead.
  const isIPadOs = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return /iPhone|iPad|iPod/.test(ua) || isIPadOs;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari legacy flag
  return window.navigator?.standalone === true;
}

function isPreviewOverride() {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("pwa") === "preview";
  } catch {
    return false;
  }
}

function wasRecentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Captures the `beforeinstallprompt` event (Chromium desktop + Android) and
 * exposes install state for the banner. iOS has no prompt event, so it is
 * handled as a manual "Add to Home Screen" flow instead.
 */
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(() => wasRecentlyDismissed());
  const [hidden, setHidden] = useState(false);
  const isIos = isIosDevice();

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      // Prevent Chrome's automatic mini-infobar so our banner is the prompt.
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    function onDisplayChange(e) {
      if (e.matches) setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", onDisplayChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mq?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // private mode — just hide for this session
    }
    setDismissed(true);
    setHidden(true);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return "unavailable";
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  // Show when: not installed, not recently dismissed, and either the browser
  // fired a real install prompt (Chromium) or this is an iOS device with
  // manual install steps. `?pwa=preview` forces it visible anywhere for UI
  // testing — the ✕ still hides it for the session via `hidden`.
  const canInstall = Boolean(deferredPrompt);
  const preview = isPreviewOverride();
  const visible = !hidden && (preview || (!installed && !dismissed && (canInstall || isIos)));

  return { visible, canInstall, isIos, installed, install, dismiss };
}
