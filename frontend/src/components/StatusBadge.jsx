import { SEVERE_STATUSES, MILD_STATUSES, OVER_STATUSES } from "../utils/statusGroups";

function variantFor(status) {
  if (status === "Normal") return "badge-normal";
  if (SEVERE_STATUSES.has(status)) return "badge-severe";
  if (MILD_STATUSES.has(status)) return "badge-mild";
  if (OVER_STATUSES.has(status)) return "badge-over";
  return "badge-muted";
}

export default function StatusBadge({ status }) {
  if (!status) return <span className="badge badge-muted">—</span>;
  return <span className={`badge ${variantFor(status)}`}>{status}</span>;
}
