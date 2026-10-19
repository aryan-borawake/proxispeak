// client/src/App.jsx — Person 1
// The page that plugs the four modules together.
// Weeks 1–2: it only shows a lab switch, so each person can open their own test page.
// Week 3: it connects net → rtc → mixer → world (see CONTRACTS.md, "How App.jsx connects them").

import { EVENTS } from '@shared/events.js';
import { RtcLab } from './rtc/index.js';
import { WorldLab } from './world/index.js';
import { AudioLab } from './audio/index.js';

// Which lab to show, from the address: ?lab=world, ?lab=audio or ?lab=rtc
const LABS = {
  world: WorldLab,
  audio: AudioLab,
  rtc: RtcLab,
};

export function App() {
  const labName = new URLSearchParams(window.location.search).get('lab');
  const Lab = LABS[labName];

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>ProxiSpeak</h1>
      <p>Skeleton running</p>
      <p>Events loaded from @shared/events.js: {Object.keys(EVENTS).length}</p>

      <nav style={{ display: 'flex', gap: 16 }}>
        <a href="?lab=world">World lab</a>
        <a href="?lab=audio">Audio lab</a>
        <a href="?lab=rtc">RTC lab</a>
        <a href="/">Home</a>
      </nav>

      <hr />
      {Lab ? <Lab /> : <p>Pick a lab above.</p>}
    </main>
  );
}
