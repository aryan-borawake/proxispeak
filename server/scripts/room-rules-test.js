// server/scripts/room-rules-test.js — Person 1, v6
// Tests every ROOM RULE of canHear (server/geo/canHear.js) with made-up people. No server, no database:
// canHear is a pure function, so we just call it.
//
// Run it (from the repo root or server/):   node server/scripts/room-rules-test.js
// Each line prints PASS or FAIL; the script exits with code 1 if anything failed.

import { AUDIO_MODES, AVATAR_MIDDLE, DISCONNECT_PX, EARSHOT_PX, STATUSES, ZONE_TYPES } from '../../shared/constants.js';
import { areaAt, canHear, isOnPlatform, shouldConnect } from '../geo/canHear.js';

let failures = 0;
function check(name, passed, detail = '') {
  if (passed) console.log(`[rules] PASS  ${name}`);
  else {
    failures += 1;
    console.log(`[rules] FAIL  ${name}  ${detail}`);
  }
}

// Made-up areas (px, avatar-middle coordinates).
const meeting = { id: 'meeting-1', name: 'Meeting room 1', type: ZONE_TYPES.PRIVATE, box: [[0, 0], [400, 300]] };
const booth = { id: 'booth-1', name: 'Phone booth 1', type: ZONE_TYPES.PRIVATE, box: [[420, 0], [500, 100]] };
const focus = { id: 'focus-1', name: 'Focus room 1', type: ZONE_TYPES.SILENT, box: [[0, 400], [300, 600]] };
const hall = { id: 'stage-hall', name: 'Stage hall', type: ZONE_TYPES.STAGE, box: [[1000, 0], [1600, 600]], platform: [[1200, 0], [1400, 100]] };
const lobby = { id: 'lobby', name: 'Lobby', type: ZONE_TYPES.LOBBY, box: [[600, 800], [1000, 1100]] };
const triangle = { id: 'tri', name: 'Odd corner', type: ZONE_TYPES.PRIVATE, polygon: [[2000, 0], [2400, 0], [2000, 400]] };
const areas = [meeting, booth, focus, hall, lobby, triangle];

/** A person whose avatar MIDDLE is at (mx, my), located with areaAt like the server does. */
function person(mx, my, status = STATUSES.AVAILABLE) {
  const x = mx - AVATAR_MIDDLE.x;
  const y = my - AVATAR_MIDDLE.y;
  const area = areaAt(areas, x, y);
  return { x, y, status, area, onPlatform: isOnPlatform(area, x, y) };
}

const full = (r) => r.audible && r.mode === AUDIO_MODES.FULL;
const falloff = (r) => r.audible && r.mode === AUDIO_MODES.FALLOFF;
const silent = (r) => !r.audible;

// ---- areaAt / isOnPlatform ----
check('0a. areaAt finds the meeting room by the avatar middle', person(100, 100).area?.id === 'meeting-1');
check('0b. areaAt: corridor (no area) → null', person(700, 500).area === null);
check('0c. polygon areas work (inside the triangle)', person(2050, 50).area?.id === 'tri');
check('0d. polygon areas work (outside the triangle, inside its bounding box)', person(2350, 350).area === null);
check('0e. on the platform → onPlatform true', person(1300, 50).onPlatform === true && person(1300, 300).onPlatform === false);

// ---- open floor ----
check('1a. open: 60 px apart → falloff', falloff(canHear(person(700, 500), person(760, 500))));
check(`1b. open: exactly EARSHOT_PX (${EARSHOT_PX}) → falloff`, falloff(canHear(person(700, 500), person(700 + EARSHOT_PX, 500))));
check('1c. open: 120 px, not connected yet → silent', silent(canHear(person(700, 500), person(820, 500))));
check(`1d. open: 120 px, already connected → still falloff (gap up to DISCONNECT_PX ${DISCONNECT_PX})`, falloff(canHear(person(700, 500), person(820, 500), { connected: true })));
check('1e. open: 150 px, connected → silent', silent(canHear(person(700, 500), person(850, 500), { connected: true })));
check('1f. lobby works like open floor (lobby ↔ corridor, 50 px)', falloff(canHear(person(650, 820), person(650, 770))));

// ---- private ----
check('2a. same private room, 350 px apart → full (no 100 px limit)', full(canHear(person(20, 20), person(370, 250))));
check('2b. same private room, side by side → full', full(canHear(person(100, 100), person(110, 100))));
check('2c. outside cannot hear in (corridor 30 px from a person inside)', silent(canHear(person(430, 150), person(395, 150))));
check('2d. inside cannot hear out', silent(canHear(person(395, 150), person(430, 150))));
check('2e. two different private rooms side by side → silent', silent(canHear(person(395, 50), person(430, 50))));
check('2f. polygon private area → full inside', full(canHear(person(2050, 50), person(2010, 300))));

// ---- silent ----
check('3a. focus room: side by side → silent', silent(canHear(person(100, 450), person(110, 450))));
check('3b. focus room ↔ corridor, 20 px → silent', silent(canHear(person(290, 500), person(310, 500))));

// ---- stage ----
const speaker = person(1300, 50);
const farAudience = person(1300, 550);
check('4a. audience hears the speaker on the platform at full, 500 px away', full(canHear(farAudience, speaker)));
check('4b. the speaker hears a far audience member? no (only by proximity)', silent(canHear(speaker, farAudience)));
check('4c. … but they still connect (the audience needs it)', shouldConnect(speaker, farAudience));
check('4d. speaker hears a near audience member by falloff', falloff(canHear(speaker, person(1300, 130))));
check('4e. two audience members 50 px apart → falloff', falloff(canHear(person(1100, 400), person(1150, 400))));
check('4f. two audience members 300 px apart → silent, not connected', silent(canHear(person(1100, 400), person(1400, 400))) && !shouldConnect(person(1100, 400), person(1400, 400)));
check('4g. outside the hall cannot hear the speaker', silent(canHear(person(950, 50), speaker)));
check('4h. two speakers on the platform hear each other at full', full(canHear(person(1210, 50), person(1390, 50))));

// ---- DND ----
check('5a. DND listener in a meeting room → silent', silent(canHear(person(20, 20, STATUSES.DND), person(30, 20))));
check('5b. DND speaker on the stage → silent to the audience', silent(canHear(farAudience, person(1300, 50, STATUSES.DND))));
check('5c. DND on open floor, side by side → silent', silent(canHear(person(700, 500), person(705, 500, STATUSES.DND))));
check('5d. busy is not DND (open floor, 40 px → falloff)', falloff(canHear(person(700, 500, STATUSES.BUSY), person(740, 500))));

if (failures > 0) {
  console.log(`[rules] ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('[rules] all checks passed');
