// client/src/app/icons.jsx — Person 1
// Small line icons drawn as inline SVG (our own simple shapes, no icon package).
// Each one is a React component: <Icon.Mic /> draws a microphone 18 px tall.

function Svg({ size = 18, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Mic: (props) => (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Svg>
  ),
  MicOff: (props) => (
    <Svg {...props}>
      <path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3" />
      <path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
    </Svg>
  ),
  Desk: (props) => (
    <Svg {...props}>
      <path d="M3 9h18M5 9v10M19 9v10M8 5h8v4H8z" />
    </Svg>
  ),
  Floors: (props) => (
    <Svg {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />
    </Svg>
  ),
  Leave: (props) => (
    <Svg {...props}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
    </Svg>
  ),
  People: (props) => (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </Svg>
  ),
  Locate: (props) => (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Svg>
  ),
  Speaker: (props) => (
    <Svg {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
    </Svg>
  ),
  Pin: (props) => (
    <Svg {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  ),
  Grid: (props) => (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  Building: (props) => (
    <Svg {...props}>
      <path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18" />
    </Svg>
  ),
  Users: (props) => (
    <Svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  ),
  Bell: (props) => (
    <Svg {...props}>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4" />
    </Svg>
  ),
  Door: (props) => (
    <Svg {...props}>
      <path d="M5 21V3h11v18M16 7l3 1v13M12 12h.01M3 21h18" />
    </Svg>
  ),
  Wave: (props) => (
    <Svg {...props}>
      <circle cx="7" cy="12" r="2" />
      <path d="M11 8a5.5 5.5 0 0 1 0 8M14.5 5a10 10 0 0 1 0 14" />
    </Svg>
  ),
  Rooms: (props) => (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16M3 12h9" />
    </Svg>
  ),
  Plug: (props) => (
    <Svg {...props}>
      <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />
    </Svg>
  ),
  Close: (props) => (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Chevron: (props) => (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  // v6: area chat (a speech bubble), a voice muffled by a wall (speaker behind a bar), layouts (a map).
  Chat: (props) => (
    <Svg {...props}>
      <path d="M4 5h16v11H9l-5 4V5z" />
      <path d="M8 9h8M8 12h5" />
    </Svg>
  ),
  Muffled: (props) => (
    <Svg {...props}>
      <path d="M3 9v6h3l4 4V5L6 9H3z" />
      <path d="M14 4v16" strokeWidth="3" />
      <path d="M18 9.5a3.5 3.5 0 0 1 0 5" />
    </Svg>
  ),
  Map: (props) => (
    <Svg {...props}>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  ),
};
