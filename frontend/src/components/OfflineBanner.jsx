import { useEffect, useState } from "react";
import { subscribeOutbox, flushOutbox, getOutboxStatus, getLastKnownUser } from "../utils/outbox";
import "./OfflineBanner.css";

/**
 * Global connectivity strip (Phase C). Rendered in Layout, above page content:
 * - Offline: warning + queued count (reads come from saved copies).
 * - Online with pending outbox: "waiting to sync" + Sync now shortcut.
 * Hidden when online with an empty queue.
 */
export default function OfflineBanner() {
  const [status, setStatus] = useState(() => getOutboxStatus());
  const [syncing, setSyncing] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => subscribeOutbox(setStatus), []);

  useEffect(() => {
    if (!status.offline) return;
    getLastKnownUser().then((row) => setEmail(row?.user?.email || ""));
  }, [status.offline]);

  async function handleSync() {
    setSyncing(true);
    try {
      await flushOutbox();
    } finally {
      setSyncing(false);
    }
  }

  if (!status.offline && status.pending === 0) return null;

  return (
    <div
      className={`offline-banner ${status.offline ? "offline-banner-offline" : "offline-banner-pending"}`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-banner-dot" aria-hidden="true" />
      <span className="offline-banner-text">
        {status.offline ? (
          <>
            You&apos;re offline — showing saved data{email ? ` as ${email}` : ""}.
            {status.pending > 0 && (
              <> {status.pending} change{status.pending === 1 ? "" : "s"} will sync on reconnect.</>
            )}
          </>
        ) : (
          <>
            {status.pending} change{status.pending === 1 ? "" : "s"} waiting to sync.
          </>
        )}
      </span>
      {!status.offline && status.pending > 0 && (
        <button type="button" className="btn btn-sm offline-banner-sync" onClick={handleSync} disabled={syncing}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      )}
    </div>
  );
}
