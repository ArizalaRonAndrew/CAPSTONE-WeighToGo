import { SEVERE_STATUSES, MILD_STATUSES, OVER_STATUSES, STATUS_ABBREVIATIONS } from "../utils/statusGroups";

function variantFor(status) {
  if (status === "Normal") return "badge-normal";
  if (SEVERE_STATUSES.has(status)) return "badge-severe";
  if (MILD_STATUSES.has(status)) return "badge-mild";
  if (OVER_STATUSES.has(status)) return "badge-over";
  return "badge-muted";
}

export default function StatusBadge({ status, compact = false }) {
  if (!status) return <span className="badge badge-muted">—</span>;
  const label = compact ? STATUS_ABBREVIATIONS[status] || status : status;
  return (
    <span className={`badge ${variantFor(status)}`} title={compact ? status : undefined}>
      {label}
    </span>
  );
}
