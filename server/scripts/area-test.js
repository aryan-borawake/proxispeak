// server/scripts/area-test.js — Person 1, v6
// A robot test for the ROOM RULES on a real server, using the floor plan's own areas
// (GET /api/office/layout → areas), so it keeps working when the map changes.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/area-test.js
//
// What it checks (each line prints PASS or FAIL):
//   1. Private: two robots in opposite corners of the biggest private area (far beyond earshot) are
//      connected with mode 'full'; a robot just outside the wall, 40 px away, is connected to neither.
//   2. Area chat: a message inside reaches both people inside and NOT the one outside; chatting on
//      open floor → BAD_CHAT.
//   3. Leaving: one robot walks out → both get "left".
//   4. Silent: two robots side by side in a focus room never connect.
//   5. Stage: the audience at the back hears the speaker on the platform ('full'); the speaker gets
//      the audience as 'falloff'. An audience member next to a speaker who steps onto the platform
//      gets peers:update "changed" → 'full'.
// Robots join as demo employees on floor-1. Their first move after joining is a jump (allowed once);
// after that they walk at running speed, so the server's speed check is respected.

import { EVENTS } from '../../shared/events.js';
import { AUDIO_MODES, ERROR_CODES, ZONE_TYPES } from '../../shared/constants.js';
import { areaAt, isClosedArea } from '../geo/canHear.js';
import { call, connectRobot, createChecker, jumpTo, messagesOf, pause, signIn, topLeftFor, walkTo } from './robots.js';

const SETTLE_MS = 900; // at least three proximity ticks
const { check, finish } = createChecker('area-test');

const boxSize = (area) => (area.box[1][0] - area.box[0][0]) * (area.box[1][1] - area.box[0][1]);

/** A spot just outside `area` (40 px from `inside`), on open floor. */
function spotOutside(areas, area, inside) {
  const [[x1, y1], [x2, y2]] = area.box;
  const candidates = [
    { x: x2 + 24, y: inside.y },
    { x: x1 - 24, y: inside.y },
    { x: inside.x, y: y2 + 24 },
    { x: inside.x, y: y1 - 24 },
  ];
  return candidates.find((c) => !isClosedArea(areaAt(areas, c.x, c.y)) && Math.hypot(c.x - inside.x, c.y - inside.y) <= 60) || null;
}

async function main() {
  const layout = (await call('GET', '/api/office/layout')).body;
  const areas = layout.areas || [];
  const tokens = await Promise.all(['riya', 'arjun', 'ananya', 'dev', 'isha', 'farhan'].map((name) => signIn(`${name}@infotact.demo`)));
  const join = (i) => ({ token: tokens[i], floorId: 'floor-1' });
  const robots = [];

  // ---- 1. private ----
  const room = areas.filter((a) => a.type === ZONE_TYPES.PRIVATE && a.box).sort((a, b) => boxSize(b) - boxSize(a))[0];
  const [[rx1, ry1], [rx2, ry2]] = room.box;
  const cornerA = topLeftFor(rx1 + 14, ry1 + 14);
  const cornerB = topLeftFor(rx2 - 14, ry2 - 14);
  const outside = spotOutside(areas, room, { x: rx2 - 14 - 12, y: ry2 - 14 - 16 }) || topLeftFor(rx2 + 30, ry2 - 14);
  const a = await connectRobot('A', join(0));
  const b = await connectRobot('B', join(1));
  const c = await connectRobot('C', join(2));
  robots.push(a, b, c);
  jumpTo(a, cornerA.x, cornerA.y);
  jumpTo(b, cornerB.x, cornerB.y);
  jumpTo(c, outside.x, outside.y);
  await pause(SETTLE_MS);
  const apart = Math.round(Math.hypot(cornerB.x - cornerA.x, cornerB.y - cornerA.y));
  check(`1a. "${room.name}": A and B ${apart} px apart are connected, mode full`, a.peers.get(b.id) === AUDIO_MODES.FULL && b.peers.get(a.id) === AUDIO_MODES.FULL, JSON.stringify([...a.peers]));
  const cToB = Math.round(Math.hypot(outside.x - b.x, outside.y - b.y));
  check(`1b. C outside the room, ${cToB} px from B: connected to nobody inside`, !c.peers.has(a.id) && !c.peers.has(b.id) && !b.peers.has(c.id), JSON.stringify([...c.peers]));

  // ---- 2. area chat ----
  a.inbox = [];
  b.inbox = [];
  c.inbox = [];
  a.socket.emit(EVENTS.CHAT_SEND, { text: 'Shall we start?' });
  c.socket.emit(EVENTS.CHAT_SEND, { text: 'Can anyone hear me?' });
  await pause(400);
  const gotA = messagesOf(a, EVENTS.CHAT_MESSAGE);
  const gotB = messagesOf(b, EVENTS.CHAT_MESSAGE);
  check('2a. chat inside reaches A and B, with the area name', gotA.length === 1 && gotB.length === 1 && gotB[0].areaId === room.id && gotB[0].text === 'Shall we start?' && gotB[0].from.id === a.id, JSON.stringify(gotB));
  check('2b. chat inside does NOT reach C outside', messagesOf(c, EVENTS.CHAT_MESSAGE).length === 0);
  check('2c. chat on open floor → BAD_CHAT', messagesOf(c, EVENTS.SERVER_ERROR).some((e) => e.code === ERROR_CODES.BAD_CHAT));

  // ---- 3. walking out ----
  await walkTo(b, outside.x + 10, outside.y);
  await pause(SETTLE_MS);
  check('3a. B walked out: A and B are no longer connected', !a.peers.has(b.id) && !b.peers.has(a.id));
  check('3b. B and C, side by side on open floor: connected, falloff', b.peers.get(c.id) === AUDIO_MODES.FALLOFF && c.peers.get(b.id) === AUDIO_MODES.FALLOFF);
  for (const robot of robots.splice(0)) robot.socket.disconnect();

  // ---- 4. silent ----
  const focus = areas.find((area) => area.type === ZONE_TYPES.SILENT && area.box);
  if (focus) {
    const [[fx1, fy1], [fx2, fy2]] = focus.box;
    const middle = { x: (fx1 + fx2) / 2, y: (fy1 + fy2) / 2 };
    const s1 = await connectRobot('S1', join(3));
    const s2 = await connectRobot('S2', join(4));
    robots.push(s1, s2);
    const p1 = topLeftFor(middle.x - 10, middle.y);
    const p2 = topLeftFor(middle.x + 10, middle.y);
    jumpTo(s1, p1.x, p1.y);
    jumpTo(s2, p2.x, p2.y);
    await pause(SETTLE_MS);
    check(`4. "${focus.name}" (silent): two robots 20 px apart never connect`, !s1.peers.has(s2.id) && !s2.peers.has(s1.id));
    for (const robot of robots.splice(0)) robot.socket.disconnect();
  } else check('4. (skipped: no silent area on this map)', true);

  // ---- 5. stage ----
  const hall = areas.find((area) => area.type === ZONE_TYPES.STAGE && area.platform);
  if (hall) {
    const [[px1, py1], [px2, py2]] = hall.platform;
    const [[hx1, hy1], [hx2, hy2]] = hall.box;
    const onStage = topLeftFor((px1 + px2) / 2, (py1 + py2) / 2);
    // The audience: the hall corner farthest from the platform.
    const corners = [[hx1 + 16, hy1 + 16], [hx2 - 16, hy1 + 16], [hx1 + 16, hy2 - 16], [hx2 - 16, hy2 - 16]];
    const back = corners.sort((p, q) => Math.hypot(q[0] - (px1 + px2) / 2, q[1] - (py1 + py2) / 2) - Math.hypot(p[0] - (px1 + px2) / 2, p[1] - (py1 + py2) / 2))[0];
    const audienceSpot = topLeftFor(back[0], back[1]);
    const speaker = await connectRobot('Speaker', join(0));
    const listener = await connectRobot('Listener', join(1));
    robots.push(speaker, listener);
    jumpTo(speaker, onStage.x, onStage.y);
    jumpTo(listener, audienceSpot.x, audienceSpot.y);
    await pause(SETTLE_MS);
    const distance = Math.round(Math.hypot(onStage.x - audienceSpot.x, onStage.y - audienceSpot.y));
    check(`5a. audience ${distance} px from the platform hears the speaker at full`, listener.peers.get(speaker.id) === AUDIO_MODES.FULL, JSON.stringify([...listener.peers]));
    check('5b. the speaker gets that audience member as falloff (receive-only)', speaker.peers.get(listener.id) === AUDIO_MODES.FALLOFF, JSON.stringify([...speaker.peers]));

    // Front row: a listener and a second person just in front of the platform (audience, 30 px apart).
    // The second person steps up onto the platform (a short walk, so they stay connected).
    const below = py2 + 40 < hy2 - 8;
    const frontY = below ? py2 + 30 : py1 - 30;
    const front = await connectRobot('Front', join(3));
    const second = await connectRobot('Second', join(2));
    robots.push(front, second);
    const frontSpot = topLeftFor((px1 + px2) / 2 - 15, frontY);
    const secondSpot = topLeftFor((px1 + px2) / 2 + 15, frontY);
    jumpTo(front, frontSpot.x, frontSpot.y);
    jumpTo(second, secondSpot.x, secondSpot.y);
    await pause(SETTLE_MS);
    check('5c. two audience members 30 px apart in the front row: falloff', front.peers.get(second.id) === AUDIO_MODES.FALLOFF, JSON.stringify([...front.peers]));
    front.inbox = [];
    const stepUp = topLeftFor((px1 + px2) / 2 + 15, below ? py2 - 16 : py1 + 16);
    await walkTo(second, stepUp.x, stepUp.y);
    await pause(SETTLE_MS);
    const changed = messagesOf(front, EVENTS.PEERS_UPDATE).flatMap((u) => u.changed);
    check('5d. the second person stepped onto the platform → the front row gets changed: full', changed.some((x) => x.id === second.id && x.mode === AUDIO_MODES.FULL) && front.peers.get(second.id) === AUDIO_MODES.FULL, JSON.stringify(messagesOf(front, EVENTS.PEERS_UPDATE)));
  } else check('5. (skipped: no stage hall with a platform on this map)', true);

  finish(robots);
}

main().catch((error) => {
  console.error(`[area-test] stopped: ${error.message}`);
  process.exit(1);
});
