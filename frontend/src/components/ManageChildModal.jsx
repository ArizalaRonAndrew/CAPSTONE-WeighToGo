import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { ageInMonths } from "../utils/age";
import { currentMonth } from "../utils/month";
import { sanitizePhoneInput, isValidPhContact, formatPhContact } from "../utils/phone";
import { sanitizeDecimalInput } from "../utils/decimal";
import StatusBadge from "./StatusBadge";
import SupplementTracker from "./SupplementTracker";

const ALL_TABS = [
  { key: "info", label: "Personal Info" },
  { key: "assessment", label: "Monthly Assessment" },
  { key: "history", label: "Checkup History" },
  { key: "vitamins", label: "Vitamins & Deworming" },
];

function monthLabel(monthString) {
  const [year, month] = monthString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function formatFullDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const ICON_PATHS = {
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  leaf: (
    <path d="M5 20c9 0 14-5 14-14V5h-1C9 5 4 10 4 19v1Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.6 3.4-6.5 7.5-6.5s7.5 2.9 7.5 6.5" />
    </>
  ),
  phone: (
    <path d="M6.6 10.8c1.4 2.7 3.6 4.9 6.3 6.3l2.1-2.1c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.6c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1.1l-2.1 2.1Z" />
  ),
};

function InfoIcon({ name }) {
  return (
    <svg
      className="info-card-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <div className="info-card">
      <InfoIcon name={icon} />
      <div>
        <div className="info-label">{label}</div>
        <div className="info-value">{value}</div>
      </div>
    </div>
  );
}

export default function ManageChildModal({ childId, onClose, onChanged, initialTab = "info", readOnly = false }) {
  useLockBodyScroll();
  const TABS = readOnly ? ALL_TABS.filter((t) => t.key !== "assessment") : ALL_TABS;
  const [tab, setTab] = useState(initialTab === "assessment" && readOnly ? "info" : initialTab);
  const [child, setChild] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState("");

  const [assessments, setAssessments] = useState([]);
  const [assessmentForm, setAssessmentForm] = useState({ weight: "", height: "" });
  const [assessmentError, setAssessmentError] = useState("");
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  // Auto-compute the nutritional status the moment weight and height are
  // both entered, so the BNS sees it before they even save the checkup.
  useEffect(() => {
    const weight = Number(assessmentForm.weight);
    const height = Number(assessmentForm.height);
    if (!(weight > 0) || !(height > 0)) {
      setPreview(null);
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewLoading(true);
    const timer = setTimeout(() => {
      api
        .post("/assessments/preview", { child_id: childId, weight, height })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [assessmentForm.weight, assessmentForm.height, childId]);

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
    if (editForm.parent_contact && !isValidPhContact(editForm.parent_contact)) {
      setInfoError("Contact number must be 11 digits and start with 09 (e.g. 09171234567).");
      return;
    }
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
      await api.post("/assessments", {
        child_id: childId,
        date_measured: new Date().toISOString().slice(0, 10),
        weight: Number(assessmentForm.weight),
        height: Number(assessmentForm.height),
      });
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
      <div
        className={`modal-card modal-card-lg ${tab === "vitamins" ? "modal-card-xl" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="manage-modal-header">
          <div className="child-avatar" aria-hidden="true">
            {getInitials(child.name)}
          </div>
          <div className="child-header-info">
            <h2>{child.name}</h2>
            <div className="child-header-location">
              {child.purok}{child.purok && child.barangay ? ", " : ""}
              {child.barangay}
            </div>
            <div className="child-header-tags">
              <span className="child-tag">Age: {ageInMonths(child.dob)} mos</span>
              <span className="child-tag">{child.gender}</span>
            </div>
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
              <div className="section-title" style={{ marginTop: 0 }}>
                Birth & Location
              </div>
              <div className="info-grid">
                <InfoCard icon="calendar" label="Birthdate" value={formatFullDate(child.dob)} />
                <InfoCard icon="pin" label="Barangay" value={child.barangay} />
                <InfoCard
                  icon="leaf"
                  label="Indigenous Person"
                  value={
                    <span className={`badge ${child.is_ip ? "badge-over" : "badge-muted"}`}>
                      {child.is_ip ? "Yes" : "No"}
                    </span>
                  }
                />
                <InfoCard icon="clock" label="Registered On" value={formatFullDate(child.created_at)} />
              </div>

              <div className="section-title">Parent / Guardian</div>
              <div className="info-grid">
                <InfoCard icon="user" label="Full Name" value={child.parent_name} />
                <InfoCard
                  icon="phone"
                  label="Contact Number"
                  value={
                    child.parent_contact ? (
                      <a href={`tel:${child.parent_contact}`}>{formatPhContact(child.parent_contact)}</a>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>

              {!readOnly && (
                <button className="btn" style={{ marginTop: 20 }} onClick={() => setEditing(true)}>
                  ✎ Edit Profile
                </button>
              )}
            </div>
          )}

          {tab === "info" && editing && !readOnly && (
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
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="09XXXXXXXXX"
                  value={editForm.parent_contact || ""}
                  onChange={(e) => setEditForm({ ...editForm, parent_contact: sanitizePhoneInput(e.target.value) })}
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

          {tab === "vitamins" && (
            <div>
              <div className="section-title" style={{ marginTop: 0 }}>
                Vitamin A &amp; Deworming Compliance
              </div>
              <SupplementTracker childId={childId} onChanged={onChanged} readOnly={readOnly} />
            </div>
          )}

          {tab === "assessment" && !readOnly && (
            <div>
              {isCheckedThisMonth ? (
                <div className="banner banner-success">✓ Checked for {monthLabel(month)}</div>
              ) : (
                <div className="banner banner-warning">⚠ Pending Checkup</div>
              )}

              {isCheckedThisMonth ? (
                <p style={{ marginTop: 20 }}>
                  This child has already been assessed for {monthLabel(month)}. Only one
                  assessment per month is allowed — check the Checkup History tab for details, or
                  come back next month.
                </p>
              ) : (
                <>
                  <h3 style={{ marginTop: 20 }}>New Checkup ({monthLabel(month)})</h3>
                  <form onSubmit={handleAddAssessment}>
                <div className="form-grid cols-2">
                  <div className="field">
                    <label>Weight (kg)</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      maxLength={5}
                      placeholder="e.g. 10.5"
                      value={assessmentForm.weight}
                      onChange={(e) =>
                        setAssessmentForm({ ...assessmentForm, weight: sanitizeDecimalInput(e.target.value) })
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Height (cm)</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="decimal"
                      maxLength={5}
                      placeholder="e.g. 75.0"
                      value={assessmentForm.height}
                      onChange={(e) =>
                        setAssessmentForm({ ...assessmentForm, height: sanitizeDecimalInput(e.target.value) })
                      }
                      required
                    />
                  </div>
                </div>

                <div className="computed-status-box">
                  <div className="computed-status-title">
                    Computed Nutritional Status
                    {previewLoading && <span className="computed-status-loading"> · computing…</span>}
                  </div>
                  <div className="computed-status-row">
                    <div className="computed-status-item">
                      <div className="computed-status-label">WFA</div>
                      <div className="computed-status-value">
                        {preview ? <StatusBadge status={preview.wfa_status} /> : "--"}
                      </div>
                    </div>
                    <div className="computed-status-item">
                      <div className="computed-status-label">HFA</div>
                      <div className="computed-status-value">
                        {preview ? <StatusBadge status={preview.hfa_status} /> : "--"}
                      </div>
                    </div>
                    <div className="computed-status-item">
                      <div className="computed-status-label">WFL/H</div>
                      <div className="computed-status-value">
                        {preview ? <StatusBadge status={preview.wfl_h_status} /> : "--"}
                      </div>
                    </div>
                  </div>
                </div>

                    {assessmentError && <p className="error-text">{assessmentError}</p>}
                    <button className="btn btn-block" type="submit" disabled={savingAssessment}>
                      {savingAssessment ? "Saving..." : "Save Monthly Assessment"}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {tab === "history" && (
            <div>
              <h3>Past Monthly Reports</h3>
              <div className="table-wrap">
                <table className="history-table">
                  <colgroup>
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "16%" }} />
                  </colgroup>
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
                        <td data-label="Month">{a.date_measured}</td>
                        <td data-label="Weight/Height">
                          {a.weight}kg / {a.height}cm
                        </td>
                        <td data-label="WFA">
                          <StatusBadge status={a.wfa_status} compact />
                        </td>
                        <td data-label="HFA">
                          <StatusBadge status={a.hfa_status} compact />
                        </td>
                        <td data-label="WFL/H">
                          <StatusBadge status={a.wfl_h_status} compact />
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
