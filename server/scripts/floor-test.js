// server/scripts/floor-test.js — Person 1
// A robot test for floors (v5): people on different floors never see each other and never get a voice
// connection, even standing at the same x and y. Also Do Not Disturb and the closed-wing move check.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev      (ADMIN_PASSWORD set, e.g. in .env)
//   2. In a second terminal, inside server/:   node scripts/floor-test.js
// If Floor 2 does not exist yet, the test adds it (as the admin). It changes nothing else.
//
// What it checks (each line prints PASS or FAIL):
//   1. Riya joins floor-1 and Arjun joins floor-2 (floorId in JOIN); both start at the elevator spot.
//      For 1.5 s: neither sees the other in players:state, nobody gets player:joined for the other,
//      and nobody gets peers:update for the other — although they are 0 px apart.
//   2. Arjun takes the elevator to floor-1 (floor:change) → he gets floor:changed, Riya gets
//      player:joined, and BOTH get peers:update "entered" for each other (same spot, same floor now).
//   3. Arjun turns on Do Not Disturb → both get "left", Riya gets player:status dnd.
//   4. Arjun back to available → both get "entered" again.
//   5. A move into a closed wing (floor-1 at tier 1: wing D) → server:error WING_CLOSED.
//   6. A name join (labs, tests) asking for a floor change → server:error BAD_FLOOR.
// If any check fails, the script exits with code 1.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { ERROR_CODES, STATUSES } from '../../shared/constants.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const WAIT_MS = 2000;
const WATCH_MS = 1500; // how long we watch for messages that must NOT arrive
const STEP_WAIT_MS = 900; // at least three proximity ticks (250 ms)

let failures = 0;
function check(name, passed, detail = '') {
  if (passed) {
    console.log(`[floor-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[floor-test] FAIL  ${name}  ${detail}`);
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${SERVER_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** A robot that records every message it gets, so each step can look at its inbox. */
function createRobot(label) {
  const socket = io(SERVER_URL, { reconnection: false });
  const robot = { label, socket, id: null, inbox: [] };
  for (const eventName of [EVENTS.PLAYERS_STATE, EVENTS.PLAYER_JOINED, EVENTS.PEERS_UPDATE, EVENTS.PLAYER_STATUS, EVENTS.FLOOR_CHANGED, EVENTS.SERVER_ERROR]) {
    socket.on(eventName, (data) => robot.inbox.push({ eventName, data }));
  }
  socket.on('connect_error', (error) => {
    console.error(`[floor-test] ${label} could not connect: ${error.message}. Is the server running?`);
    process.exit(1);
  });
  return robot;
}

function waitFor(socket, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${eventName} within ${WAIT_MS} ms`)), WAIT_MS);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

const messages = (robot, eventName) => robot.inbox.filter((m) => m.eventName === eventName).map((m) => m.data);
const enteredIds = (robot) => messages(robot, EVENTS.PEERS_UPDATE).flatMap((u) => u.entered.map((e) => e.id));
const leftIds = (robot) => messages(robot, EVENTS.PEERS_UPDATE).flatMap((u) => u.left);
const anyPeersUpdateMentions = (robot, id) => messages(robot, EVENTS.PEERS_UPDATE).some((u) => u.entered.some((e) => e.id === id) || u.left.includes(id));
const statesShow = (robot, id) => messages(robot, EVENTS.PLAYERS_STATE).some((s) => s.players.some((p) => p.id === id));

async function signIn(email) {
  const answer = await call('POST', '/api/auth/employee', { body: { email } });
  if (answer.status !== 200) throw new Error(`could not sign in ${email}: ${JSON.stringify(answer.body)}`);
  return answer.body.token;
}

async function main() {
  // Floor 2 must exist. Add it as the admin if needed.
  const admin = await call('POST', '/api/auth/admin', { body: { email: 'admin@infotact.demo', password: process.env.ADMIN_PASSWORD || '' } });
  if (admin.status !== 200) {
    console.error('[floor-test] admin sign-in failed: set ADMIN_PASSWORD (same value as the server).');
    process.exit(1);
  }
  const floors = await call('GET', '/api/admin/floors', { token: admin.body.token });
  if (!floors.body.some((floor) => floor.floorId === 'floor-2')) {
    await call('POST', '/api/admin/floors', { token: admin.body.token });
    console.log('[floor-test] added Floor 2 for this test');
  }

  const riyaToken = await signIn('riya@infotact.demo');
  const arjunToken = await signIn('arjun@infotact.demo');
  const riya = createRobot('Riya');
  const arjun = createRobot('Arjun');

  // ---- 1. different floors, same spot ----
  const riyaInit = waitFor(riya.socket, EVENTS.WORLD_INIT);
  riya.socket.emit(EVENTS.JOIN, { token: riyaToken, floorId: 'floor-1' });
  riya.id = (await riyaInit).selfId;
  const arjunInit = waitFor(arjun.socket, EVENTS.WORLD_INIT);
  arjun.socket.emit(EVENTS.JOIN, { token: arjunToken, floorId: 'floor-2' });
  const arjunWorld = await arjunInit;
  arjun.id = arjunWorld.selfId;
  // Riya walks to exactly where Arjun stands (the elevator spot), on HER floor.
  riya.socket.emit(EVENTS.MOVE, { x: arjunWorld.spawn.x, y: arjunWorld.spawn.y, dir: 'up' });
  await pause(WATCH_MS);

  check('1a. Arjun joined floor-2 (his world:init roomId)', arjunWorld.roomId === 'floor-2', arjunWorld.roomId);
  check("1b. Arjun's world:init does not list Riya", !arjunWorld.players.some((p) => p.id === riya.id));
  check("1c. Riya's players:state never shows Arjun", !statesShow(riya, arjun.id));
  check("1d. Arjun's players:state never shows Riya", !statesShow(arjun, riya.id));
  check('1e. no player:joined across floors', !messages(riya, EVENTS.PLAYER_JOINED).some((p) => p.id === arjun.id) && !messages(arjun, EVENTS.PLAYER_JOINED).some((p) => p.id === riya.id));
  check('1f. no peers:update for each other at 0 px apart', !anyPeersUpdateMentions(riya, arjun.id) && !anyPeersUpdateMentions(arjun, riya.id), JSON.stringify(messages(riya, EVENTS.PEERS_UPDATE)));

  // ---- 2. same floor → connected ----
  riya.inbox = [];
  arjun.inbox = [];
  arjun.socket.emit(EVENTS.FLOOR_CHANGE, { floorId: 'floor-1' });
  await pause(STEP_WAIT_MS);
  const changed = messages(arjun, EVENTS.FLOOR_CHANGED)[0];
  check('2a. Arjun gets floor:changed for floor-1 (same socket id)', changed?.roomId === 'floor-1' && changed?.selfId === arjun.id, JSON.stringify(changed)?.slice(0, 200));
  check('2b. Riya gets player:joined for Arjun', messages(riya, EVENTS.PLAYER_JOINED).some((p) => p.id === arjun.id));
  check('2c. both get peers:update entered for each other', enteredIds(riya).includes(arjun.id) && enteredIds(arjun).includes(riya.id), `${JSON.stringify(messages(riya, EVENTS.PEERS_UPDATE))}`);

  // ---- 3. Do Not Disturb ----
  riya.inbox = [];
  arjun.inbox = [];
  arjun.socket.emit(EVENTS.PLAYER_STATUS, { status: STATUSES.DND });
  await pause(STEP_WAIT_MS);
  check('3a. DND: both get left for each other', leftIds(riya).includes(arjun.id) && leftIds(arjun).includes(riya.id));
  check('3b. DND: Riya gets player:status { id: Arjun, status: dnd }', messages(riya, EVENTS.PLAYER_STATUS).some((s) => s.id === arjun.id && s.status === STATUSES.DND));
  riya.socket.emit(EVENTS.MOVE, { x: arjunWorld.spawn.x + 4, y: arjunWorld.spawn.y, dir: 'right' });
  await pause(STEP_WAIT_MS);
  check('3c. DND: Riya moving next to him does not reconnect', !enteredIds(riya).includes(arjun.id));

  // ---- 4. back to available ----
  riya.inbox = [];
  arjun.inbox = [];
  arjun.socket.emit(EVENTS.PLAYER_STATUS, { status: STATUSES.AVAILABLE });
  await pause(STEP_WAIT_MS);
  check('4. available again: both get entered', enteredIds(riya).includes(arjun.id) && enteredIds(arjun).includes(riya.id));

  // ---- 5. closed wing ----
  const snapshot = await call('GET', '/api/office/floors/floor-1', { token: riyaToken });
  const layout = (await call('GET', '/api/office/layout')).body;
  const closedWing = layout.wings.find((wing) => !snapshot.body.openWings.includes(wing.id));
  if (closedWing) {
    riya.inbox = [];
    riya.socket.emit(EVENTS.MOVE, { x: closedWing.rect.x + 100, y: closedWing.rect.y + 100, dir: 'down' });
    await pause(400);
    check(`5. a move into closed wing ${closedWing.id} → WING_CLOSED`, messages(riya, EVENTS.SERVER_ERROR).some((e) => e.code === ERROR_CODES.WING_CLOSED));
  } else {
    check('5. (skipped: every wing on floor-1 is open)', true);
  }

  // ---- 7. an admin change reaches the floor as office:update ----
  // Saving Engineering with its own name changes nothing, but it is an admin change like any other.
  const officeUpdate = waitFor(riya.socket, EVENTS.OFFICE_UPDATE).catch(() => null);
  await call('PATCH', '/api/admin/departments/dept-engineering', { token: admin.body.token, body: { name: 'Engineering' } });
  const update = await officeUpdate;
  check('7. an admin change → office:update for floor-1 with tier, open wings and departments', update?.floorId === 'floor-1' && Array.isArray(update.openWings) && Array.isArray(update.departments), JSON.stringify(update)?.slice(0, 200));

  // ---- 6. labs can't change floor ----
  const lab = createRobot('Lab');
  const labInit = waitFor(lab.socket, EVENTS.WORLD_INIT);
  lab.socket.emit(EVENTS.JOIN, { name: 'Lab robot' });
  await labInit;
  lab.socket.emit(EVENTS.FLOOR_CHANGE, { floorId: 'floor-1' });
  await pause(400);
  check('6. a name join asking for a floor change → BAD_FLOOR', messages(lab, EVENTS.SERVER_ERROR).some((e) => e.code === ERROR_CODES.BAD_FLOOR));

  for (const robot of [riya, arjun, lab]) robot.socket.disconnect();
  if (failures > 0) {
    console.log(`[floor-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[floor-test] all checks passed');
  process.exit(0);
}

main().catch((error) => {
  console.error(`[floor-test] stopped: ${error.message}`);
  process.exit(1);
});
