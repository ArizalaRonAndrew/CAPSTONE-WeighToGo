import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ageInMonths } from "../utils/age";
import { currentMonth } from "../utils/month";
import StatusBadge from "./StatusBadge";

const TABS = [
  { key: "info", label: "Personal Info" },
  { key: "assessment", label: "Monthly Assessment" },
  { key: "history", label: "Checkup History" },
];

function monthLabel(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function ManageChildModal({ childId, onClose, onChanged }) {
  const [tab, setTab] = useState("info");
  const [child, setChild] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState("");

  const [assessments, setAssessments] = useState([]);
  const [assessmentForm, setAssessmentForm] = useState({ weight: "", height: "" });
  const [assessmentError, setAssessmentError] = useState("");
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [latestResult, setLatestResult] = useState(null);

  function loadChild() {
    api.get(`/children/${childId}`).then((data) => {
      setChild(data);
      setEditForm(data);
    });
  }

  function loadAssessments() {
    api.get(`/assessments?childId=${childId}`).then(setAssessments);
  }

  useEffect(() => {
    loadChild();
    loadAssessments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  if (!child) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
          <div className="loading-state">Loading...</div>
        </div>
      </div>
    );
  }

  const month = currentMonth();
  const isCheckedThisMonth = assessments.some((a) => a.date_measured?.slice(0, 7) === month);

  async function handleSaveInfo(e) {
    e.preventDefault();
    setInfoError("");
    setSavingInfo(true);
    try {
      const updated = await api.patch(`/children/${childId}`, {
        name: editForm.name,
        parent_name: editForm.parent_name,
        parent_contact: editForm.parent_contact,
        purok: editForm.purok,
        gender: editForm.gender,
        is_ip: editForm.is_ip,
      });
      setChild(updated);
      setEditing(false);
      onChanged?.();
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
        child_id: childId,
        date_measured: new Date().toISOString().slice(0, 10),
        weight: Number(assessmentForm.weight),
        height: Number(assessmentForm.height),
      });
      setLatestResult(created);
      setAssessmentForm({ weight: "", height: "" });
      loadAssessments();
      onChanged?.();
    } catch (err) {
      setAssessmentError(err.message);
    } finally {
      setSavingAssessment(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="manage-modal-header">
          <svg className="manage-modal-icon" viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
            <circle cx="12" cy="7" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
          <h2>{child.name}</h2>
          <div className="manage-modal-meta">
            📍 {child.purok} | Age: {ageInMonths(child.dob)} mos | {child.gender}
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? "tab-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {tab === "info" && !editing && (
            <div>
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">Child's Name</div>
                  <div className="info-value">{child.name}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Gender</div>
                  <div className="info-value">{child.gender}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Birthdate</div>
                  <div className="info-value">{child.dob}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Parents</div>
                  <div className="info-value">{child.parent_name}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Purok</div>
                  <div className="info-value">{child.purok}</div>
                </div>
              </div>
              <button className="btn" style={{ marginTop: 16 }} onClick={() => setEditing(true)}>
                ✎ Edit Profile
              </button>
            </div>
          )}

          {tab === "info" && editing && (
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
                <label>Purok / Sitio</label>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditForm(child);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
                <button className="btn" type="submit" disabled={savingInfo}>
                  {savingInfo ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}

          {tab === "assessment" && (
            <div>
              {isCheckedThisMonth ? (
                <div className="banner banner-success">✓ Checked for {monthLabel(month)}</div>
              ) : (
                <div className="banner banner-warning">⚠ Pending Checkup</div>
              )}

              <h3 style={{ marginTop: 20 }}>New Checkup ({monthLabel(month)})</h3>
              <form onSubmit={handleAddAssessment}>
                <div className="form-grid cols-2">
                  <div className="field">
                    <label>Weight (kg)</label>
                    <input
                      className="input"
                      type="number"
                      step="0.1"
                      placeholder="e.g. 10.5"
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
                      placeholder="e.g. 75.0"
                      value={assessmentForm.height}
                      onChange={(e) => setAssessmentForm({ ...assessmentForm, height: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="computed-status-box">
                  <div className="computed-status-title">Computed Nutritional Status</div>
                  <div className="computed-status-row">
                    <div className="computed-status-item">
                      <div className="computed-status-label">WFA</div>
                      <div className="computed-status-value">
                        {latestResult ? <StatusBadge status={latestResult.wfa_status} /> : "--"}
                      </div>
                    </div>
                    <div className="computed-status-item">
                      <div className="computed-status-label">HFA</div>
                      <div className="computed-status-value">
                        {latestResult ? <StatusBadge status={latestResult.hfa_status} /> : "--"}
                      </div>
                    </div>
                    <div className="computed-status-item">
                      <div className="computed-status-label">WFL/H</div>
                      <div className="computed-status-value">
                        {latestResult ? <StatusBadge status={latestResult.wfl_h_status} /> : "--"}
                      </div>
                    </div>
                  </div>
                </div>

                {assessmentError && <p className="error-text">{assessmentError}</p>}
                <button className="btn btn-block" type="submit" disabled={savingAssessment}>
                  {savingAssessment ? "Saving..." : "Save Monthly Assessment"}
                </button>
              </form>
            </div>
          )}

          {tab === "history" && (
            <div>
              <h3>Past Monthly Reports</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Weight/Height</th>
                      <th>WFA</th>
                      <th>HFA</th>
                      <th>WFL/H</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty-state">
                          No history available.
                        </td>
                      </tr>
                    )}
                    {assessments.map((a) => (
                      <tr key={a.id}>
                        <td>{a.date_measured}</td>
                        <td>
                          {a.weight}kg / {a.height}cm
                        </td>
                        <td>
                          <StatusBadge status={a.wfa_status} />
                        </td>
                        <td>
                          <StatusBadge status={a.hfa_status} />
                        </td>
                        <td>
                          <StatusBadge status={a.wfl_h_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
