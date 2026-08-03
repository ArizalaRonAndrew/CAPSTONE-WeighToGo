import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useBarangays } from "../hooks/useBarangays";

const EMPTY_FORM = {
  name: "",
  dob: "",
  parent_name: "",
  parent_contact: "",
  barangay: "",
  purok: "",
  gender: "Male",
  is_ip: false,
};

export default function RegisterChildModal({ onClose, onRegistered }) {
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
    setSubmitting(true);
    try {
      const child = await api.post("/children", form);
      onRegistered(child);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Register a Child</h2>
        <div className="form-grid">
          <div className="field">
            <label>Full Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </div>
          <div className="form-grid cols-2">
            <div className="field">
              <label>Date of Birth</label>
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
          <div className="field">
            <label>Parent / Guardian Name</label>
            <input
              className="input"
              value={form.parent_name}
              onChange={(e) => update("parent_name", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Parent Contact Number</label>
            <input
              className="input"
              value={form.parent_contact}
              onChange={(e) => update("parent_contact", e.target.value)}
            />
          </div>
          <div className="form-grid cols-2">
            {user?.role === "MNAO" ? (
              <div className="field">
                <label>Barangay</label>
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
              <label>Purok</label>
              <input className="input" value={form.purok} onChange={(e) => update("purok", e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={form.is_ip}
                onChange={(e) => update("is_ip", e.target.checked)}
              />{" "}
              Indigenous Person (IP)
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Saving..." : "Register"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
