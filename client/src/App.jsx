// client/src/App.jsx — Person 1
// The page that plugs the four modules together.
//
// The address decides what you see:
//   /                 → the full app (OfficeLab.jsx: net → rtc → mixer → world, see CONTRACTS.md
//                       section 8). This is what visitors of the deployed site get.
//   /?lab=world       → Person 3's world test page
//   /?lab=audio       → Person 4's audio test page
//   /?lab=rtc         → Person 1's signaling and WebRTC test page
//   /?lab=office      → the full app again (the old address still works)
//   /?lab=<anything else> → the list of test pages

import { RtcLab } from './rtc/index.js';
import { WorldLab } from './world/index.js';
import { AudioLab } from './audio/index.js';
import { OfficeLab } from './OfficeLab.jsx';

// Which lab to show, from the address: ?lab=world, ?lab=audio, ?lab=rtc or ?lab=office
const LABS = {
  world: WorldLab,
  audio: AudioLab,
  rtc: RtcLab,
  office: OfficeLab,
};

export function App() {
  // URLSearchParams reads the part of the address after "?". .get('lab') is null when there is none.
  const labName = new URLSearchParams(window.location.search).get('lab');

  // No ?lab at all: the full app.
  // Example: https://proxispeak-client.onrender.com/ → labName is null → OfficeLab.
  const Page = labName === null ? OfficeLab : LABS[labName];

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>ProxiSpeak</h1>

      <nav style={{ display: 'flex', gap: 16 }}>
        <a href="/">Office</a>
        <a href="?lab=world">World lab</a>
        <a href="?lab=audio">Audio lab</a>
        <a href="?lab=rtc">RTC lab</a>
      </nav>

      <hr />
      {Page ? <Page /> : <p>There is no lab called "{labName}". Pick one above.</p>}
    </main>
  );
}
