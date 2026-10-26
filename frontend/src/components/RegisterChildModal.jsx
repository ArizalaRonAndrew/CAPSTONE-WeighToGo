import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll";
import { sanitizePhoneInput, isValidPhContact } from "../utils/phone";
import {
  combineChildName,
  sanitizeNameInput,
  isValidPersonName,
  PERSON_NAME_HINT,
} from "../utils/name";
import { ageInMonths } from "../utils/age";
import { todayInManila } from "../utils/month";
import { listEntries } from "../utils/outbox.js";

const MAX_REGISTRATION_AGE_MONTHS = 59;

const EMPTY_FORM = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  dob: "",
  parent_name: "",
  parent_contact: "",
  barangay: "",
  purok: "",
  gender: "Male",
  is_ip: false,
};

function draftKey(userId) {
  return `wtg:register-child-draft:v1:${userId || "anon"}`;
}

function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { form: EMPTY_FORM, restored: false };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { form: EMPTY_FORM, restored: false };
    const hasContent = ["firstName", "middleName", "lastName", "suffix", "dob", "parent_name", "parent_contact", "purok"].some(
      (k) => typeof parsed[k] === "string" && parsed[k].trim() !== ""
    );
    if (!hasContent && parsed.is_ip !== true && parsed.gender !== "Female") {
      return { form: EMPTY_FORM, restored: false };
    }
    return { form: { ...EMPTY_FORM, ...parsed }, restored: hasContent || parsed.is_ip === true };
  } catch {
    return { form: EMPTY_FORM, restored: false };
  }
}

export default function RegisterChildModal({ onClose, onRegistered }) {
  useLockBodyScroll();
  const { user } = useAuth();
  const key = draftKey(user?.id);
  const [form, setForm] = useState(() => loadDraft(draftKey(user?.id)).form);
  const [draftRestored, setDraftRestored] = useState(() => loadDraft(draftKey(user?.id)).restored);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dobErrorTimer = useRef(null);

  // If the auth user resolves after first render, pull in that user's saved
  // draft — but never wipe what was already typed when there is no draft.
  useEffect(() => {
    const { form: saved, restored } = loadDraft(key);
    if (restored) {
      setForm(saved);
      setDraftRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist every keystroke so an accidental navigation, reload, or
  // dismissed modal never wipes what was already typed. Cleared on successful register.
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(form));
    } catch {
      // storage full / private mode — form still works, just not persisted
    }
  }, [form, key]);

  // Clear the pending dob-error timer if the modal closes before 5 seconds.
  useEffect(() => {
    return () => {
      if (dobErrorTimer.current) {
        clearTimeout(dobErrorTimer.current);
        dobErrorTimer.current = null;
      }
    };
  }, []);

  const today = todayInManila();

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function clearDobError() {
    setError("");
    if (dobErrorTimer.current) {
      clearTimeout(dobErrorTimer.current);
      dobErrorTimer.current = null;
    }
  }

  function handleDobChange(value) {
    clearDobError();
    setForm((prev) => ({ ...prev, dob: value }));
    if (!value) return;
    if (ageInMonths(value) > MAX_REGISTRATION_AGE_MONTHS) {
      // Empty the birthdate field and show the error for 5 seconds.
      setForm((prev) => ({ ...prev, dob: "" }));
      setError(
        `Only children ${MAX_REGISTRATION_AGE_MONTHS} months old or younger can be registered. This child is ${ageInMonths(
          value
        )} months old.`
      );
      dobErrorTimer.current = setTimeout(() => {
        setError("");
        dobErrorTimer.current = null;
      }, 5000);
    }
  }

  function clearDraft() {
    setForm(EMPTY_FORM);
    setDraftRestored(false);
    setError("");
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (!isValidPersonName(form.firstName)) {
      setError(`First name: ${PERSON_NAME_HINT}`);
      return;
    }
    if (form.middleName.trim() && !isValidPersonName(form.middleName, { minLength: 1 })) {
      setError(`Middle name: ${PERSON_NAME_HINT}`);
      return;
    }
    if (!isValidPersonName(form.lastName)) {
      setError(`Last name: ${PERSON_NAME_HINT}`);
      return;
    }
    if (form.suffix.trim() && !isValidPersonName(form.suffix, { minLength: 1 })) {
      setError(`Suffix: ${PERSON_NAME_HINT}`);
      return;
    }
    if (!form.dob) {
      setError("Date of birth is required.");
      return;
    }
    if (form.dob > today) {
      setError("Date of birth cannot be in the future.");
      return;
    }
    if (ageInMonths(form.dob) > MAX_REGISTRATION_AGE_MONTHS) {
      setError(
        `Only children ${MAX_REGISTRATION_AGE_MONTHS} months old or younger can be registered. This child is ${ageInMonths(form.dob)} months old.`
      );
      return;
    }
    if (!form.parent_name.trim()) {
      setError("Parent / Guardian name is required.");
      return;
    }
    if (!isValidPersonName(form.parent_name)) {
      setError(`Parent / Guardian name: ${PERSON_NAME_HINT}`);
      return;
    }
    if (!form.parent_contact) {
      setError("Contact number is required.");
      return;
    }
    if (!isValidPhContact(form.parent_contact)) {
      setError("Contact number must be 11 digits and start with 09 (e.g. 09171234567).");
      return;
    }
    setSubmitting(true);
    try {
      const { firstName, middleName, lastName, suffix, ...rest } = form;
      const payload = { ...rest, name: combineChildName({ firstName, middleName, lastName, suffix }) };
      // Client-side duplicate guard: same name (case/space-insensitive) +
      // same birthdate. The server re-checks scoped to the barangay and
      // returns 409, but catching it here gives instant feedback without a
      // failed round trip. Queued (still-offline) registrations count too so
      // the same child can't be enqueued twice while offline.
      const norm = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();
      const dobDay = String(payload.dob).slice(0, 10);
      const isSameChild = (c) => norm(c?.name) === norm(payload.name) && String(c?.dob || "").slice(0, 10) === dobDay;
      try {
        const queued = await listEntries().catch(() => []);
        if (Array.isArray(queued) && queued.some((e) => e.method === "POST" && String(e.path).split("?")[0] === "/children" && isSameChild(e.body))) {
          setError("This child is already registered (same name and birthdate).");
          return;
        }
      } catch {
        // queue scan is best-effort — roster + server checks still apply
      }
      try {
        const roster = await api.get("/children");
        if (Array.isArray(roster) && roster.some(isSameChild)) {
          setError("This child is already registered (same name and birthdate).");
          return;
        }
      } catch {
        // Roster pre-check is best-effort (offline/uncached) — the server's
        // 409 below is the authoritative guard.
      }
      const child = await api.post("/children", payload);
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
      onRegistered(child);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form
        className="modal-card modal-card-lg register-modal"
        onSubmit={handleSubmit}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="register-modal-sticky">
          <div className="modal-header">
            <h2>Register a Child</h2>
            <p className="modal-subtitle">Add a new child to the barangay masterlist.</p>
          </div>
        </div>

        <div className="register-modal-body">
          {draftRestored && (
            <div className="banner banner-warning" style={{ marginBottom: 14 }}>
              Restored your unsaved entries from last time.{" "}
              <button type="button" className="btn btn-sm btn-secondary" onClick={clearDraft}>
                Clear form
              </button>
            </div>
          )}
          <div className="form-section">
            <div className="section-title">Child Information</div>
            <div className="form-grid cols-4 register-name-grid">
              <div className="field">
                <label className="required">First Name</label>
                <input
                  className="input"
                  value={form.firstName}
                  onChange={(e) => update("firstName", sanitizeNameInput(e.target.value))}
                  placeholder="e.g. Juan"
                  title={PERSON_NAME_HINT}
                  autoComplete="given-name"
                  maxLength={50}
                  required
                />
              </div>
              <div className="field">
                <label>Middle Name</label>
                <input
                  className="input"
                  value={form.middleName}
                  onChange={(e) => update("middleName", sanitizeNameInput(e.target.value))}
                  placeholder="e.g. Santos"
                  title={PERSON_NAME_HINT}
                  autoComplete="additional-name"
                  maxLength={50}
                />
              </div>
              <div className="field">
                <label className="required">Last Name</label>
                <input
                  className="input"
                  value={form.lastName}
                  onChange={(e) => update("lastName", sanitizeNameInput(e.target.value))}
                  placeholder="e.g. Dela Cruz"
                  title={PERSON_NAME_HINT}
                  autoComplete="family-name"
                  maxLength={50}
                  required
                />
              </div>
              <div className="field field-suffix">
                <label>Suffix</label>
                <input
                  className="input"
                  value={form.suffix}
                  onChange={(e) => update("suffix", sanitizeNameInput(e.target.value))}
                  placeholder="e.g. Jr."
                  title={PERSON_NAME_HINT}
                  autoComplete="off"
                  maxLength={10}
                />
              </div>
            </div>
            <div className="form-grid cols-2 register-dob-grid">
              <div className="field">
                <label className="required">Date of Birth</label>
                <input
                  className="input"
                  type="date"
                  value={form.dob}
                  max={today}
                  onChange={(e) => handleDobChange(e.target.value)}
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
                  onChange={(e) => update("parent_name", sanitizeNameInput(e.target.value))}
                  placeholder="e.g. Maria Dela Cruz"
                  title={PERSON_NAME_HINT}
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </div>
              <div className="field">
                <label className="required">Contact Number</label>
                <input
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="09XXXXXXXXX"
                  value={form.parent_contact}
                  onChange={(e) => update("parent_contact", sanitizePhoneInput(e.target.value))}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="section-title">Location</div>
            <div className="form-grid cols-2">
              <div className="field">
                <label>Barangay</label>
                <input className="input" value={user?.assigned_barangay || ""} disabled />
              </div>
              <div className="field">
                <label className="required">Purok</label>
                <input className="input" value={form.purok} onChange={(e) => update("purok", e.target.value)} required />
              </div>
            </div>
            <div className="checkbox-card register-ip-card">
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
        </div>

        <div className="register-modal-footer">
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
