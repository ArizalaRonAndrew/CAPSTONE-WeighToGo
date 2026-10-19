import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLogo from "../components/AppLogo";
import MobileAccessBlockModal from "../components/MobileAccessBlockModal";
import { useIsMobile } from "../hooks/useIsMobile";

// Login layout: full-viewport split screen.
// Left (majority) = branding: top-left app logo + "WeighToGo",
// Balayan logo slot, vertically-centered nutrition copy.
// Right = login modal (semi-transparent) with email + password.
export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mobileBlocked, setMobileBlocked] = useState(false);
  const isMobile = useIsMobile();
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
      // MNAO portal is desktop-only: block login on a mobile device or mobile
      // viewport even when credentials are correct — show a modal instead of
      // redirecting to the dashboard.
      if (user.role === "MNAO" && isMobile) {
        setMobileBlocked(true);
        return;
      }
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
        {/* Left Panel - Branding (majority of the view) */}
        <div className="login-brand">
          {/* Large curved background shape */}
          <div className="login-brand-curve" aria-hidden="true"></div>

          {/* Top-left corner: app logo + "WeighToGo" + Balayan logo slot */}
          <header className="login-brand-top">
            <div className="login-brand-identity">
              <AppLogo size={85} className="login-top-logo" />
              <span className="login-brand-name">WeighToGo</span>
            </div>
          </header>

          {/* Vertically-centered descriptive nutrition copy */}
          <div className="login-brand-content">
            <h1 className="login-brand-title">
              Healthy weight, healthy future.
            </h1>
            <p className="login-brand-text">
              WeighToGo helps the Municipality of Balayan track every
              child&apos;s growth — weight, height, vitamins, and deworming —
              so barangay health workers can catch malnutrition early and guide
              every family toward proper nutrition.
            </p>
          </div>
        </div>

        {/* Right Panel - Login modal */}
        <div className="login-form-side">
          {/* Top Right Corner Accent */}
          <div className="login-accent login-accent-tr" aria-hidden="true"></div>
          {/* Bottom Left Corner Accent */}
          <div className="login-accent login-accent-bl" aria-hidden="true"></div>

          <div className="login-modal">
            {/* Form Elements */}
            <form className="login-form" onSubmit={handleSubmit}>
            <h2 className="login-welcome login-welcome-desktop">welcome</h2>
            <h2 className="login-welcome login-welcome-mobile">WeighToGo</h2>

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
      {mobileBlocked && (
        <MobileAccessBlockModal onClose={() => setMobileBlocked(false)} />
      )}
    </div>
  );
}
