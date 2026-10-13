import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLogo from "../components/AppLogo";

// Login layout follows the approved login.jpg mock / LoginReference
// containers: gray page, white rounded card (fixed 500px on desktop),
// green brand panel with circular curve on the left, white form panel
// with corner accents on the right. Our WeighToGo logo is used for
// branding. A Privacy Policy overlay blocks the form on entry and is
// removed only after the checkbox is ticked.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false
  );

  useEffect(() => {
    const update = () => setIsOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "MNAO" ? "/admin/trends" : "/bns/masterlist", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-split">
        {/* Left Panel - Branding */}
        <div className="login-brand">
          {/* Large curved background shape */}
          <div className="login-brand-curve" aria-hidden="true"></div>

          {/* Content */}
          <div className="login-brand-content">
            {/* Logo — our WeighToGo logo */}
            <div className="login-logo-ring">
              <AppLogo size={76} className="login-logo-img" />
            </div>
            <h1 className="login-brand-title">WeighToGo</h1>
          </div>
        </div>

        {/* Right Panel - Login Form */}
        <div className="login-form-side">
          {/* Top Right Corner Accent */}
          <div className="login-accent login-accent-tr" aria-hidden="true"></div>
          {/* Bottom Left Corner Accent */}
          <div className="login-accent login-accent-bl" aria-hidden="true"></div>

          {/* Form Elements */}
          <form className="login-form" onSubmit={handleSubmit}>
            <h2 className="login-welcome">welcome</h2>

            {isOffline && (
              <div className="banner banner-warning login-offline-float" role="alert">
                You&apos;re offline — connect to the internet to log in.
              </div>
            )}

            <div className="login-fields">
              <div className="field">
                <label className="sr-only" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input login-pill"
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label className="sr-only" htmlFor="password">Password</label>
                <div className="password-wrap">
                  <input
                    id="password"
                    className="input login-pill"
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <path d="m1 1 22 22" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
                        <path d="M2 12s3.5-7 11-7 11 7 11 7-3.5 7-11 7-11-7-11-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Fixed-reservation error slot so the card never changes shape */}
            <p
              className="error-text login-error"
              style={{ visibility: error ? "visible" : "hidden" }}
              aria-live="polite"
            >
              {error || "\u00A0"}
            </p>

            <div className="login-privacy-row">
              <input
                type="checkbox"
                id="privacy"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <label htmlFor="privacy">
                I agree to the Privacy Policy
              </label>
            </div>

            <button
              className="login-submit"
              type="submit"
              disabled={submitting || !agreed}
              title={!agreed ? "Please agree to the Privacy Policy first" : undefined}
            >
              {submitting ? "Logging in..." : "LOG IN"}
            </button>

          </form>
        </div>
      </div>

      {/* Privacy Policy overlay — blocks the form until the checkbox is ticked */}
      {!agreed && (
        <div
          className="login-privacy-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-privacy-title"
        >
          <div className="login-privacy-card">
            <h2 id="login-privacy-title">Privacy Policy</h2>
            <div className="login-privacy-body" tabIndex={0}>
              <p>
                <strong>Privacy Policy — R.A. No. 10173 (Data Privacy
                Act of 2012).</strong> WeighToGo processes personal and
                sensitive personal information of children (names, birth
                dates, growth measurements, and health and nutrition records)
                strictly for the Balayan Municipal Nutrition Program —
                masterlists, checkups, supplements, and reports.
              </p>
              <p>
                Access is limited to authorized BNS and MNAO personnel.
                Records are kept confidential, stored securely, and used only
                for program purposes. They are never shared publicly or used
                beyond the nutrition program without proper consent or legal
                basis.
              </p>
              <p>
                Parents and guardians may request access to or correction of
                their child&apos;s records through the MNAO, in line with
                their rights under the Data Privacy Act as overseen by the
                National Privacy Commission. By logging in, you confirm that
                you are an authorized user and agree to keep all
                children&apos;s information private and secure.
              </p>
            </div>
            <label
              className="login-privacy-check"
              htmlFor="privacy-overlay-agree"
            >
              <input
                id="privacy-overlay-agree"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                autoFocus
              />
              <span>
                I have read and agree to the <strong>Privacy Policy</strong>{" "}
                above — tick to continue to the login form.
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
