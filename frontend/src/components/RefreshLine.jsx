import { formatUpdatedAgo } from "../hooks/useRevReport";

/**
 * Shared "Updated Xm ago · Refresh" line for rev-gated pages. Subtle by
 * design: cached data renders instantly, so this only signals freshness and
 * offers a manual refetch (which ignores revision counters).
 */
export default function RefreshLine({ refreshing, updatedAt, onRefresh }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 10,
        margin: "2px 0 10px",
        fontSize: 12.5,
        color: "var(--color-text-muted)",
      }}
    >
      <span>{refreshing ? "Updating…" : updatedAt ? `Updated ${formatUpdatedAgo(updatedAt)}` : ""}</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onRefresh} disabled={refreshing}>
        Refresh
      </button>
    </div>
  );
}
