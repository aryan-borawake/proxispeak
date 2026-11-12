// server/scripts/load-test.js — Person 1, v6 (spec Week 3: "50 bots walking around, measure each check")
// Pretends to be many people at once: bots sign in as directory employees, join floor-1 and walk
// around at MOVE_SEND_HZ (10 moves a second), like real browsers. The SERVER logs its proximity-tick
// timing every 5 s ("[tick] stats 5s: … avg … p95 … max … peers/user …"); this script prints what the
// bots saw, and the server's last timing window from GET /api/health.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev      (ADMIN_PASSWORD set, e.g. in .env)
//   2. In a second terminal, inside server/:
//        node scripts/load-test.js --bots=50 --seconds=30 --spread    (bots all over the floor)
//        node scripts/load-test.js --bots=50 --seconds=30 --packed    (all 50 in the lobby: worst case)
// Bots use the demo directory's employees (several bots may share one person's name): the directory is
// only read, never changed. Bots walk at the normal walking speed, stay out of walls and closed
// neighbourhoods (they read the same map and floor snapshot as the browser), and leave at the end.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { AVATAR_MIDDLE, MOVE_SEND_HZ, TICK_STATS_LOG_MS, WALK_SPEED_PX_PER_SEC } from '../../shared/constants.js';
import { call, pause, SERVER_URL } from './robots.js';

// ---- command line: --bots=50 --seconds=30 --spread | --packed ----
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const BOTS = Number(args.bots) || 50;
const SECONDS = Number(args.seconds) || 30;
const MODE = args.packed ? 'packed' : 'spread';
const FLOOR_ID = args.floor || 'floor-1';

const STEP_MS = 1000 / MOVE_SEND_HZ; // 100 ms between moves
const STEP_PX = WALK_SPEED_PX_PER_SEC / MOVE_SEND_HZ; // 22 px per move
const PACKED_RADIUS_PX = 280; // packed mode: bots stay this close to the lobby spawn point

const mapPath = fileURLToPath(new URL('../../client/public/maps/office.json', import.meta.url));
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const tileSize = map.tilewidth;
const blockingLayers = map.layers.filter((layer) => layer.name === 'collision' || layer.name === 'walls');

/** Can an avatar stand at (x, y)? The same four corner points the browser checks (map.js). */
function isBlocked(x, y, closedRects) {
  const corners = [[x + 4, y + 8], [x + 20, y + 8], [x + 4, y + 24], [x + 20, y + 24]];
  for (const [px, py] of corners) {
    const tx = Math.floor(px / tileSize);
    const ty = Math.floor(py / tileSize);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true;
    if (blockingLayers.some((layer) => layer.data[ty * map.width + tx] !== 0)) return true;
  }
  const mx = x + AVATAR_MIDDLE.x;
  const my = y + AVATAR_MIDDLE.y;
  return closedRects.some((r) => mx >= r.x && mx < r.x + r.w && my >= r.y && my < r.y + r.h);
}

/** A random free spot: anywhere on the floor (spread) or near the lobby spawn (packed). */
function randomSpot(closedRects, spawn) {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const x = MODE === 'packed' ? spawn.x + (Math.random() * 2 - 1) * PACKED_RADIUS_PX : 4 * tileSize + Math.random() * (map.width - 8) * tileSize;
    const y = MODE === 'packed' ? spawn.y + (Math.random() * 2 - 1) * PACKED_RADIUS_PX : 4 * tileSize + Math.random() * (map.height - 8) * tileSize;
    if (!isBlocked(x, y, closedRects)) return { x, y };
  }
  return { ...spawn };
}

function pickDirection(bot) {
  const angle = Math.random() * Math.PI * 2;
  bot.vx = Math.cos(angle);
  bot.vy = Math.sin(angle);
  bot.turnAt = Date.now() + 1000 + Math.random() * 2000;
}

/** One walking step for a bot (stay out of walls; packed bots also stay near the lobby). */
function step(bot, closedRects, spawn) {
  if (Date.now() > bot.turnAt) pickDirection(bot);
  if (MODE === 'packed' && Math.hypot(bot.x - spawn.x, bot.y - spawn.y) > PACKED_RADIUS_PX) {
    const length = Math.hypot(spawn.x - bot.x, spawn.y - bot.y);
    bot.vx = (spawn.x - bot.x) / length;
    bot.vy = (spawn.y - bot.y) / length;
  }
  for (let tries = 0; tries < 6; tries += 1) {
    const nx = bot.x + bot.vx * STEP_PX;
    const ny = bot.y + bot.vy * STEP_PX;
    if (!isBlocked(nx, ny, closedRects)) {
      bot.x = nx;
      bot.y = ny;
      const dir = Math.abs(bot.vx) > Math.abs(bot.vy) ? (bot.vx > 0 ? 'right' : 'left') : bot.vy > 0 ? 'down' : 'up';
      bot.socket.emit(EVENTS.MOVE, { x: bot.x, y: bot.y, dir });
      bot.moves += 1;
      return;
    }
    pickDirection(bot);
  }
}

async function main() {
  console.log(`[load] ${BOTS} bots, ${SECONDS} s, ${MODE}, ${FLOOR_ID}, server ${SERVER_URL}`);
  const admin = await call('POST', '/api/auth/admin', { body: { email: 'admin@infotact.demo', password: process.env.ADMIN_PASSWORD || '' } });
  if (admin.status !== 200) throw new Error('admin sign-in failed: set ADMIN_PASSWORD (the same value as the server) to read the directory');
  const employees = (await call('GET', '/api/admin/employees', { token: admin.body.token })).body.filter((e) => e.role !== 'admin');
  const tokens = [];
  for (const employee of employees) {
    const answer = await call('POST', '/api/auth/employee', { body: { email: employee.email } });
    if (answer.status === 200) tokens.push(answer.body.token);
  }
  if (tokens.length === 0) throw new Error('no employee could sign in');
  const layout = (await call('GET', '/api/office/layout')).body;
  const snapshot = (await call('GET', `/api/office/floors/${FLOOR_ID}`, { token: tokens[0] })).body;
  const closedRects = layout.wings.filter((wing) => !snapshot.openWings.includes(wing.id)).map((wing) => wing.rect);
  console.log(`[load] ${tokens.length} directory people sign in for the bots; open neighbourhoods on ${FLOOR_ID}: ${snapshot.openWings.join(', ')}`);

  // ---- join ----
  const bots = [];
  const errors = {};
  let peersUpdates = 0;
  for (let i = 0; i < BOTS; i += 1) {
    const socket = io(SERVER_URL, { reconnection: false, transports: ['websocket'] });
    const bot = { socket, id: null, x: 0, y: 0, vx: 0, vy: 0, turnAt: 0, peers: new Set(), states: 0, moves: 0 };
    socket.on(EVENTS.PEERS_UPDATE, (update) => {
      peersUpdates += 1;
      for (const { id } of update.entered) bot.peers.add(id);
      for (const id of update.left) bot.peers.delete(id);
    });
    socket.on(EVENTS.PLAYERS_STATE, () => {
      bot.states += 1;
    });
    socket.on(EVENTS.SERVER_ERROR, ({ code, message }) => {
      if (!errors[code]) console.log(`[load] first ${code}: ${message}`);
      errors[code] = (errors[code] || 0) + 1;
    });
    const init = await new Promise((resolve, reject) => {
      socket.once(EVENTS.WORLD_INIT, resolve);
      socket.once('connect_error', (error) => reject(new Error(`bot ${i + 1} could not connect: ${error.message}`)));
      socket.emit(EVENTS.JOIN, { token: tokens[i % tokens.length], floorId: FLOOR_ID });
    });
    bot.id = init.selfId;
    const spot = randomSpot(closedRects, layout.spawn);
    bot.x = spot.x;
    bot.y = spot.y;
    socket.emit(EVENTS.MOVE, { x: bot.x, y: bot.y, dir: 'down' }); // the first move after joining may jump
    pickDirection(bot);
    bots.push(bot);
  }
  console.log(`[load] ${bots.length} bots joined; walking for ${SECONDS} s (${MOVE_SEND_HZ} moves/s each, ${WALK_SPEED_PX_PER_SEC} px/s)`);

  // ---- walk ----
  const walker = setInterval(() => {
    for (const bot of bots) step(bot, closedRects, layout.spawn);
  }, STEP_MS);
  const started = Date.now();
  const samples = [];
  let nextReport = started + TICK_STATS_LOG_MS;
  while (Date.now() - started < SECONDS * 1000) {
    await pause(250);
    if (Date.now() >= nextReport) {
      nextReport += TICK_STATS_LOG_MS;
      const counts = bots.map((bot) => bot.peers.size);
      const avg = counts.reduce((sum, n) => sum + n, 0) / counts.length;
      samples.push({ avg, max: Math.max(...counts) });
      console.log(`[load] ${Math.round((Date.now() - started) / 1000)} s: peers per bot avg ${avg.toFixed(1)}, max ${Math.max(...counts)}`);
    }
  }
  clearInterval(walker);

  // ---- report ----
  const elapsedS = (Date.now() - started) / 1000;
  const health = (await call('GET', '/api/health')).body;
  const counts = bots.map((bot) => bot.peers.size);
  const statesPerSecond = bots.reduce((sum, bot) => sum + bot.states, 0) / bots.length / elapsedS;
  const movesPerSecond = bots.reduce((sum, bot) => sum + bot.moves, 0) / bots.length / elapsedS;
  console.log('[load] ---- result ----');
  console.log(`[load] mode ${MODE}, ${bots.length} bots, ${elapsedS.toFixed(1)} s`);
  console.log(`[load] moves sent per bot: ${movesPerSecond.toFixed(1)}/s; players:state received per bot: ${statesPerSecond.toFixed(1)}/s`);
  console.log(`[load] peers per bot at the end: avg ${(counts.reduce((s, n) => s + n, 0) / counts.length).toFixed(1)}, max ${Math.max(...counts)} (MAX_PEERS 8)`);
  console.log(`[load] peers:update messages: ${peersUpdates} (${(peersUpdates / elapsedS).toFixed(1)}/s for all bots)`);
  console.log(`[load] server errors: ${Object.keys(errors).length === 0 ? 'none' : JSON.stringify(errors)}`);
  console.log(`[load] server tick (last ${health.tick?.windowS ?? '?'} s window): ${health.tick ? `avg ${health.tick.avgMs} ms, p95 ${health.tick.p95Ms} ms, max ${health.tick.maxMs} ms, moved ${health.tick.movedPerTick}/tick, peers/user avg ${health.tick.peersPerUserAvg} max ${health.tick.peersPerUserMax}` : 'none yet'}`);
  console.log(`[load] RESULT ${JSON.stringify({ mode: MODE, bots: bots.length, seconds: Math.round(elapsedS), statesPerBotPerS: Number(statesPerSecond.toFixed(1)), movesPerBotPerS: Number(movesPerSecond.toFixed(1)), peersAvg: Number((counts.reduce((s, n) => s + n, 0) / counts.length).toFixed(1)), peersMax: Math.max(...counts), tick: health.tick, errors })}`);
  for (const bot of bots) bot.socket.disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(`[load] stopped: ${error.message}`);
  process.exit(1);
});
