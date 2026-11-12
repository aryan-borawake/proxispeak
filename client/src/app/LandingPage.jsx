// client/src/app/LandingPage.jsx — Person 1
// Screen 1 (#/): what ProxiSpeak is, and the way in ("Enter the Infotact office" → sign-in).
// Infotact is our client; their name appears only as text. Logo and pictures are our own:
// the preview on the right is a screenshot of OUR office map (client/public/office-preview.png).

import { Logo } from './Logo.jsx';
import { Icon } from './icons.jsx';
import { ROUTES, navigate } from './router.js';

// The four feature cards under the hero. Kept as data, so adding a card is one more line.
const FEATURES = [
  {
    icon: <Icon.Wave />,
    title: 'Voice that fades with distance',
    text: 'Walk up to a colleague and you hear them. Walk away and their voice fades out, left or right ear depending on where they stand.',
  },
  {
    icon: <Icon.Rooms />,
    title: 'Rooms and focus areas',
    text: 'Meeting rooms, a lounge, a stage for all-hands and a quiet focus room, on a map everyone shares.',
  },
  {
    icon: <Icon.Desk />,
    title: 'Desks by department',
    text: 'Every department sits together in its own block. New hires get the next desk, and the office grows wing by wing.',
  },
  {
    icon: <Icon.Plug />,
    title: "Built into Infotact's dashboard",
    text: 'Employees sign in with their Infotact identity. Admins manage departments, floors and desks from one page.',
  },
];

export function LandingPage() {
  return (
    <div>
      <header className="topbar">
        <Logo />
        <div className="topbar-actions">
          <button className="btn" onClick={() => navigate(ROUTES.SIGN_IN)}>
            Sign in
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div>
          <span className="label">Virtual office for Infotact</span>
          <h1>An office where you hear the colleagues next to you.</h1>
          <p>Walk around a shared map. When you come close to someone, you can simply talk, the way you would at their desk.</p>
          <p>No meeting links and no calls to schedule: just the people near you, getting quieter as you walk away.</p>
          <button className="btn btn-primary btn-big" onClick={() => navigate(ROUTES.SIGN_IN)}>
            Enter the Infotact office <Icon.Chevron />
          </button>
        </div>

        <figure className="card landing-preview" style={{ margin: 0 }}>
          <img src="/office-preview.png" alt="Top-down view of the ProxiSpeak office map with desks, meeting rooms and a lounge" />
          <figcaption className="landing-preview-caption">
            <span>Infotact HQ · Floor 1</span>
            <span>4 wings · 100 desks</span>
          </figcaption>
        </figure>
      </section>

      <section className="landing-features">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="card feature-card">
            <div className="feature-icon">{feature.icon}</div>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <footer className="landing-footer">Built for Infotact · Group 40</footer>
    </div>
  );
}
