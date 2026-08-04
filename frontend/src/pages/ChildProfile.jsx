import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { formatAge } from "../utils/age";
import { formatPhContact } from "../utils/phone";
import StatusBadge from "../components/StatusBadge";
import SupplementTracker from "../components/SupplementTracker";

function formatFullDate(dateString) {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function InfoField({ label, value }) {
  return (
    <div className="info-card">
      <div>
        <div className="info-label">{label}</div>
        <div className="info-value">{value ?? "—"}</div>
      </div>
    </div>
  );
}

export default function ChildProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [child, setChild] = useState(null);
  const [assessments, setAssessments] = useState([]);

  useEffect(() => {
    api.get(`/children/${id}`).then(setChild);
    api.get(`/assessments?childId=${id}`).then(setAssessments);
  }, [id]);

  if (!child) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            ← Back
          </button>
          <h1>{child.name}</h1>
          <p className="subtitle" style={{ color: "var(--color-text-muted)", margin: 0 }}>
            View-only profile · {formatAge(child.dob)} old
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Personal Info</h3>
        <div className="info-grid">
          <InfoField label="Full Name" value={child.name} />
          <InfoField label="Date of Birth" value={formatFullDate(child.dob)} />
          <InfoField label="Gender" value={child.gender} />
          <InfoField label="Barangay" value={child.barangay} />
          <InfoField label="Purok / Sitio" value={child.purok} />
          <InfoField label="Indigenous Person (IP)" value={child.is_ip ? "Yes" : "No"} />
          <InfoField label="Parent / Guardian" value={child.parent_name} />
          <InfoField
            label="Parent Contact"
            value={child.parent_contact ? formatPhContact(child.parent_contact) : "—"}
          />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Vitamin A & Deworming Compliance</h3>
        <SupplementTracker childId={id} readOnly />
      </div>

      <div className="card">
        <h3>Checkup History</h3>
        {assessments.length === 0 && <p className="empty-state">No assessments recorded yet.</p>}
        <div className="timeline">
          {assessments.map((a) => (
            <div className="timeline-item" key={a.id}>
              <div className="date">{a.date_measured}</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0" }}>
                {a.weight} kg · {a.height} cm · {a.age_in_months} months old
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusBadge status={a.wfa_status} />
                <StatusBadge status={a.hfa_status} />
                <StatusBadge status={a.wfl_h_status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
