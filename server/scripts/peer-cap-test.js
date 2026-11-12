// server/scripts/peer-cap-test.js — Person 1, v6
// A robot test for MAX_PEERS (8): however crowded it gets, nobody has more than 8 voice connections,
// and every connection is listed on BOTH sides.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/peer-cap-test.js
//
// What it checks:
//   1. 12 robots (lab joins) crowd onto one spot: everyone has at most 8 peers, everyone has some,
//      and the peer lists are symmetric (A lists B ⇔ B lists A).
//   2. The nearest are kept: a 13th robot 95 px away (within earshot) joins. Every crowd link is
//      nearer than it, so no crowd member drops a link for it: it only gets the free slots.
// Lab joins ({ name }) live in DEFAULT_ROOM, where every spot is open floor.

import { DEFAULT_SPAWN, MAX_PEERS } from '../../shared/constants.js';
import { connectRobot, createChecker, jumpTo, pause } from './robots.js';

const CROWD = 12;
const SETTLE_MS = 1200;
const { check, finish } = createChecker('peer-cap-test');

async function main() {
  const robots = [];
  for (let i = 0; i < CROWD; i += 1) {
    const robot = await connectRobot(`Crowd ${i + 1}`, { name: `Crowd ${i + 1}` }, { record: false });
    // A tight circle around the spawn point, 2–14 px from the middle: everybody is within earshot.
    jumpTo(robot, DEFAULT_SPAWN.x + Math.cos(i) * (2 + i), DEFAULT_SPAWN.y + Math.sin(i) * (2 + i));
    robots.push(robot);
  }
  await pause(SETTLE_MS);

  const counts = robots.map((robot) => robot.peers.size);
  check(`1a. ${CROWD} robots on one spot: nobody has more than ${MAX_PEERS} peers (counts ${counts.join(' ')})`, counts.every((n) => n <= MAX_PEERS));
  check('1b. everybody has at least one peer', counts.every((n) => n >= 1));
  const byId = new Map(robots.map((robot) => [robot.id, robot]));
  const symmetric = robots.every((robot) => [...robot.peers.keys()].every((id) => byId.get(id)?.peers.has(robot.id)));
  check('1c. every connection is listed on both sides', symmetric);
  const total = counts.reduce((sum, n) => sum + n, 0) / 2;
  check(`1d. the crowd is well connected: ${total} links (at least ${Math.floor((CROWD * (MAX_PEERS - 1)) / 2)})`, total >= Math.floor((CROWD * (MAX_PEERS - 1)) / 2));

  // ---- 2. a far robot does not push out near ones ----
  const crowdLinks = () => robots.flatMap((robot) => [...robot.peers.keys()].filter((id) => byId.has(id)).map((id) => [robot.id, id].sort().join('|'))).sort().join(',');
  const before = crowdLinks();
  const freeSlots = robots.filter((robot) => robot.peers.size < MAX_PEERS).length;
  const far = await connectRobot('Far', { name: 'Far' }, { record: false });
  jumpTo(far, DEFAULT_SPAWN.x + 95, DEFAULT_SPAWN.y);
  robots.push(far);
  await pause(SETTLE_MS);
  const capped = robots.every((robot) => robot.peers.size <= MAX_PEERS);
  check(`2a. with a 13th robot 95 px away, still nobody above ${MAX_PEERS}`, capped, robots.map((r) => r.peers.size).join(' '));
  robots.pop();
  check(`2b. the crowd kept all its (nearer) links; the far robot only took free slots (${far.peers.size} peers, ${freeSlots} crowd members had room)`, crowdLinks() === before && far.peers.size <= freeSlots);
  robots.push(far);

  finish(robots);
}

main().catch((error) => {
  console.error(`[peer-cap-test] stopped: ${error.message}`);
  process.exit(1);
});
