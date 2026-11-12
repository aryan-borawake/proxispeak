// client/src/App.jsx — Person 1
// The page that plugs the four modules together, and decides which screen to show.
//
// Two kinds of address:
//   1. Test pages (labs), chosen with ?lab=… (unchanged from Weeks 1–4):
//        /?lab=world   → Person 3's world test page
//        /?lab=audio   → Person 4's audio test page
//        /?lab=rtc     → Person 1's signaling and WebRTC test page
//        /?lab=office  → all four modules on one test page (OfficeLab.jsx)
//        /?lab=<anything else> → the list of test pages
//   2. The product for Infotact, chosen with the part after # (hash routing, app/router.js):
//        /#/        → landing page          /#/signin → sign-in (employee or admin)
//        /#/lobby   → lobby (colour, mic)   /#/office → the office
//        /#/admin   → admin page
//      With no ?lab, the product shows. The deployed site's front page is the landing page.

import { RtcLab } from './rtc/index.js';
import { WorldLab } from './world/index.js';
import { AudioLab } from './audio/index.js';
import { OfficeLab } from './OfficeLab.jsx';
import { ProductApp } from './app/ProductApp.jsx';

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

  // No ?lab at all: the product (landing → sign-in → lobby → office, and the admin page).
  if (labName === null) {
    return <ProductApp />;
  }

  const Page = LABS[labName];
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>ProxiSpeak</h1>

      <nav style={{ display: 'flex', gap: 16 }}>
        <a href="/">Product</a>
        <a href="?lab=office">Office lab</a>
        <a href="?lab=world">World lab</a>
        <a href="?lab=audio">Audio lab</a>
        <a href="?lab=rtc">RTC lab</a>
      </nav>

      <hr />
      {Page ? <Page /> : <p>There is no lab called "{labName}". Pick one above.</p>}
    </main>
  );
}
