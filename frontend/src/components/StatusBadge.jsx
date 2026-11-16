import { STATUS_ABBREVIATIONS, statusBadgeClass } from "../utils/statusGroups";

export default function StatusBadge({ status, compact = false }) {
  if (!status) return <span className="badge badge-muted">—</span>;
  const label = compact ? STATUS_ABBREVIATIONS[status] || status : status;
  return (
    <span className={`badge ${statusBadgeClass(status)}`} title={compact ? status : undefined}>
      {label}
    </span>
  );
}
