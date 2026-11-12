// client/src/app/Logo.jsx — Person 1
// ProxiSpeak's own logo mark, drawn as inline SVG (a picture made of shapes, written in the page,
// so there is no image file to load). The idea: a dot (you) with two sound waves around it,
// the waves get fainter further out, like voices fading with distance.

export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--accent)" />
      <circle cx="12" cy="16" r="3.2" fill="#fff" />
      <path d="M17 10.5a7.5 7.5 0 0 1 0 11" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M21 7a12 12 0 0 1 0 18" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The mark plus the word "ProxiSpeak". */
export function Logo({ size = 28 }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">ProxiSpeak</span>
    </span>
  );
}
