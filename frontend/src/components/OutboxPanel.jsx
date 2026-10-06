import { useEffect, useState } from "react";
import {
  subscribeOutbox,
  getOutboxStatus,
  listEntries,
  flushOutbox,
  retryEntry,
  discardEntry,
  resolveConflict,
} from "../utils/outbox";
import "./OutboxPanel.css";

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const STATUS_LABEL = {
  pending: "Waiting",
  blocked: "Waiting",
  syncing: "Sending…",
  failed: "Failed",
  conflicted: "Needs review",
};

/**
 * Floating pending-count pill (bottom-left, mirrors the PWA banner side).
 * Hidden when the queue is empty and everything synced.
 */
export function SyncBadge({ onOpen }) {
  const [status, setStatus] = useState(() => getOutboxStatus());

  useEffect(() => subscribeOutbox(setStatus), []);

  const actionable = status.pending + status.failed + status.conflicted;
  if (actionable === 0 && !status.syncing) return null;

  return (
    <button
      type="button"
      className={`sync-badge ${status.failed + status.conflicted > 0 ? "sync-badge-attention" : ""}`}
      onClick={onOpen}
      aria-label={`${actionable} offline changes pending review or sync. Open sync queue.`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {status.syncing ? "Syncing…" : `${actionable} to sync`}
    </button>
  );
}

/**
 * Modal listing queued/failed/conflicted mutations with recovery actions.
 * - failed/blocked: Retry (requeue) or Discard.
 * - conflicted (server copy changed mid-offline): Keep mine (resend as the
 *   explicit latest write) or Use server (drop the queued edit).
 */
export default function OutboxPanel({ open, onClose }) {
  const [entries, setEntries] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(() => getOutboxStatus());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listEntries().then((rows) => {
      if (alive) setEntries(rows);
    });
    const unsub = subscribeOutbox((s) => {
      setStatus(s);
      listEntries().then((rows) => {
        if (alive) setEntries(rows);
      });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [open ]);

  if (!open) return null;

  async function refresh() {
    setEntries(await listEntries());
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await flushOutbox();
    } finally {
      setSyncing(false);
      refresh();
    }
  }

  async function handleRetry(opId) {
    await retryEntry(opId);
    refresh();
    handleSync();
  }

  async function handleDiscard(opId) {
    await discardEntry(opId);
    refresh();
  }

  async function handleConflict(opId, keep) {
    await resolveConflict(opId, keep);
    refresh();
    if (keep === "mine") handleSync();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Offline sync queue">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="modal-header">
          <h2>Sync queue</h2>
          <p className="modal-subtitle">
            Changes saved on this device while offline. They send automatically on reconnect, newest session first
            after older ones.
          </p>
        </div>

        {status.lastSyncAt && (
          <p className="outbox-last-sync">
            Last sync: {formatTime(status.lastSyncAt)}
          </p>
        )}

        {entries.length === 0 ? (
          <p className="empty-state">Nothing waiting — everything is synced.</p>
        ) : (
          <ul className="outbox-list">
            {entries.map((e) => (
              <li key={e.opId || e.seq} className={`outbox-item outbox-${e.status}`}>
                <div className="outbox-item-main">
                  <div className="outbox-item-label">{e.label || `${e.method} ${e.path}`}</div>
                  <div className="outbox-item-meta">
                    {formatTime(e.createdAt)}
                    {e.attempts > 1 && ` · ${e.attempts} tries`}
                  </div>
                  {e.lastError && <div className="outbox-item-error">{e.lastError}</div>}
                  {e.resultNote && <div className="outbox-item-note">{e.resultNote}</div>}
                </div>
                <div className="outbox-item-side">
                  <span className={`badge outbox-status-${e.status}`}>{STATUS_LABEL[e.status] || e.status}</span>
                  <div className="outbox-item-actions">
                    {e.status === "conflicted" ? (
                      <>
                        <button type="button" className="btn btn-sm" onClick={() => handleConflict(e.opId, "mine")} disabled={syncing}>
                          Keep mine
                        </button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleConflict(e.opId, "server")} disabled={syncing}>
                          Use server
                        </button>
                      </>
                    ) : (
                      <>
                        {(e.status === "failed" || e.status === "blocked") && (
                          <button type="button" className="btn btn-sm" onClick={() => handleRetry(e.opId)} disabled={syncing}>
                            Retry
                          </button>
                        )}
                        {(e.status === "failed" || e.status === "conflicted") && (
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDiscard(e.opId)} disabled={syncing}>
                            Discard
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn" onClick={handleSync} disabled={syncing || entries.length === 0}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>
    </div>
  );
}
