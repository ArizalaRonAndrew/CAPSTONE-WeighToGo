import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { sanitizePhoneInput, isValidPhContact } from "../utils/phone";
import { combineChildName } from "../utils/name";

const EMPTY_FORM = {
  firstName: "",
  middleName: "",
  lastName: "",
  dob: "",
  parent_name: "",
  parent_contact: "",
  barangay: "",
  purok: "",
  gender: "Male",
  is_ip: false,
};

export default function RegisterChildModal({ onClose, onRegistered }) {
  useLockBodyScroll();
  const { user } = useAuth();
  const { barangays } = useBarangays();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (form.parent_contact && !isValidPhContact(form.parent_contact)) {
      setError("Contact number must be 11 digits and start with 09 (e.g. 09171234567).");
      return;
    }
    setSubmitting(true);
    try {
      const { firstName, middleName, lastName, ...rest } = form;
      const payload = { ...rest, name: combineChildName({ firstName, middleName, lastName }) };
      const child = await api.post("/children", payload);
      onRegistered(child);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal-card modal-card-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <h2>Register a Child</h2>
          <p className="modal-subtitle">Add a new child to the barangay masterlist.</p>
        </div>

        <div className="form-section">
          <div className="section-title">Child Information</div>
          <div className="form-grid cols-3">
            <div className="field">
              <label className="required">First Name</label>
              <input
                className="input"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Middle Name</label>
              <input
                className="input"
                value={form.middleName}
                onChange={(e) => update("middleName", e.target.value)}
              />
            </div>
            <div className="field">
              <label className="required">Last Name</label>
              <input
                className="input"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-grid cols-2" style={{ marginTop: 14 }}>
            <div className="field">
              <label className="required">Date of Birth</label>
              <input
                className="input"
                type="date"
                value={form.dob}
                onChange={(e) => update("dob", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Gender</label>
              <select className="input" value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="section-title">Parent / Guardian</div>
          <div className="form-grid cols-2">
            <div className="field">
              <label className="required">Full Name</label>
              <input
                className="input"
                value={form.parent_name}
                onChange={(e) => update("parent_name", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Contact Number</label>
              <input
                className="input"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                placeholder="09XXXXXXXXX"
                value={form.parent_contact}
                onChange={(e) => update("parent_contact", sanitizePhoneInput(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="section-title">Location</div>
          <div className="form-grid cols-2">
            {user?.role === "MNAO" ? (
              <div className="field">
                <label className="required">Barangay</label>
                <select
                  className="input"
                  value={form.barangay}
                  onChange={(e) => update("barangay", e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select barangay
                  </option>
                  {barangays.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label>Barangay</label>
                <input className="input" value={user?.assigned_barangay || ""} disabled />
              </div>
            )}
            <div className="field">
              <label className="required">Purok</label>
              <input className="input" value={form.purok} onChange={(e) => update("purok", e.target.value)} required />
            </div>
          </div>
          <div className="checkbox-card" style={{ marginTop: 14 }}>
            <label>
              <input
                type="checkbox"
                checked={form.is_ip}
                onChange={(e) => update("is_ip", e.target.checked)}
              />
              Indigenous Person (IP)
            </label>
          </div>
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Saving..." : "Register"}
          </button>
        </div>
      </form>
    </div>
  );
}
