import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { formatAge } from "../utils/age";
import StatusBadge from "../components/StatusBadge";
import SupplementTracker from "../components/SupplementTracker";

const EMPTY_ASSESSMENT = { date_measured: new Date().toISOString().slice(0, 10), weight: "", height: "" };

export default function ChildProfile() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [child, setChild] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState("");

  const [assessments, setAssessments] = useState([]);
  const [assessmentForm, setAssessmentForm] = useState(EMPTY_ASSESSMENT);
  const [assessmentError, setAssessmentError] = useState("");
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [latestResult, setLatestResult] = useState(null);

  function loadChild() {
    api.get(`/children/${id}`).then((data) => {
      setChild(data);
      setEditForm(data);
    });
  }

  function loadAssessments() {
    api.get(`/assessments?childId=${id}`).then(setAssessments);
  }

  useEffect(() => {
    loadChild();
    loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveInfo(e) {
    e.preventDefault();
    setInfoError("");
    setSavingInfo(true);
    try {
      const updated = await api.patch(`/children/${id}`, {
        name: editForm.name,
        parent_name: editForm.parent_name,
        parent_contact: editForm.parent_contact,
        purok: editForm.purok,
        gender: editForm.gender,
        is_ip: editForm.is_ip,
      });
      setChild(updated);
    } catch (err) {
      setInfoError(err.message);
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleAddAssessment(e) {
    e.preventDefault();
    setAssessmentError("");
    setSavingAssessment(true);
    try {
      const created = await api.post("/assessments", {
        child_id: id,
        date_measured: assessmentForm.date_measured,
        weight: Number(assessmentForm.weight),
        height: Number(assessmentForm.height),
      });
      setLatestResult(created);
      setAssessmentForm(EMPTY_ASSESSMENT);
      loadAssessments();
    } catch (err) {
      setAssessmentError(err.message);
    } finally {
      setSavingAssessment(false);
    }
  }

  if (!child) return <div className="loading-state">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            ← Back
          </button>
          <h1>{child.name}</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Personal Info</h3>
        <form className="form-grid cols-2" onSubmit={handleSaveInfo}>
          <div className="field">
            <label>Full Name</label>
            <input
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Date of Birth</label>
            <input className="input" value={child.dob} disabled />
          </div>
          <div className="field">
            <label>Gender</label>
            <select
              className="input"
              value={editForm.gender}
              onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
          <div className="field">
            <label>Barangay</label>
            <input className="input" value={child.barangay} disabled />
          </div>
          <div className="field">
            <label>Purok</label>
            <input
              className="input"
              value={editForm.purok}
              onChange={(e) => setEditForm({ ...editForm, purok: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Parent / Guardian</label>
            <input
              className="input"
              value={editForm.parent_name}
              onChange={(e) => setEditForm({ ...editForm, parent_name: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Parent Contact</label>
            <input
              className="input"
              value={editForm.parent_contact || ""}
              onChange={(e) => setEditForm({ ...editForm, parent_contact: e.target.value })}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={editForm.is_ip}
                onChange={(e) => setEditForm({ ...editForm, is_ip: e.target.checked })}
              />{" "}
              Indigenous Person (IP)
            </label>
          </div>
          {infoError && <p className="error-text">{infoError}</p>}
          <div>
            <button className="btn" type="submit" disabled={savingInfo}>
              {savingInfo ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>Vitamin A & Deworming Compliance</h3>
        <SupplementTracker childId={id} />
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3>New Monthly Assessment</h3>
        <p className="subtitle" style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Current age: {formatAge(child.dob)}
        </p>
        <form className="form-grid cols-2" onSubmit={handleAddAssessment}>
          <div className="field">
            <label>Date Measured</label>
            <input
              className="input"
              type="date"
              value={assessmentForm.date_measured}
              onChange={(e) => setAssessmentForm({ ...assessmentForm, date_measured: e.target.value })}
              required
            />
          </div>
          <div />
          <div className="field">
            <label>Weight (kg)</label>
            <input
              className="input"
              type="number"
              step="0.1"
              value={assessmentForm.weight}
              onChange={(e) => setAssessmentForm({ ...assessmentForm, weight: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Height (cm)</label>
            <input
              className="input"
              type="number"
              step="0.1"
              value={assessmentForm.height}
              onChange={(e) => setAssessmentForm({ ...assessmentForm, height: e.target.value })}
              required
            />
          </div>
          {assessmentError && <p className="error-text">{assessmentError}</p>}
          <div>
            <button className="btn" type="submit" disabled={savingAssessment}>
              {savingAssessment ? "Saving..." : "Save Assessment"}
            </button>
          </div>
        </form>

        {latestResult && (
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatusBadge status={latestResult.wfa_status} />
            <StatusBadge status={latestResult.hfa_status} />
            <StatusBadge status={latestResult.wfl_h_status} />
          </div>
        )}
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
