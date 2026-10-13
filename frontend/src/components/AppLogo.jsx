import logoSrc from "../assets/weightogo.jpg";

// Central WeighToGo logo — single source of truth.
// The picture lives at `src/assets/weightogo.jpg` and is also
// copied to `public/weightogo.jpg` + `public/logo.jpg` so it
// doubles as the Chrome tab icon (see index.html).
export default function AppLogo({ size = 72, className = "" }) {
  return (
    <img
      src={logoSrc}
      alt="WeighToGo logo"
      width={size}
      height={size}
      className={`app-logo ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
