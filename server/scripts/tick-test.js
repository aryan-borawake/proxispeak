// server/scripts/tick-test.js — Person 1 (Module 1: Signaling + WebRTC)
// A small test that pretends to be browsers, to check the proximity tick (Task 6):
// peers:update "entered" when two players come close, "left" when they walk apart.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/tick-test.js
//
// B always stands at the spawn point (200, 200). A walks along y = 200, so the distance
// between them is just A's x minus 200. Connect at <= 100 px (EARSHOT_PX), disconnect
// only at > 140 px (DISCONNECT_PX).
//
// What it checks (each line prints PASS or FAIL):
//   1. A and B join at the same spot (0 px): both get "entered" for the other, once, mode falloff.
//      Neither has moved, so this proves new players are checked too.
//   2. A walks to x 400 (200 px): both get "left".
//   3. A walks to x 330 (130 px): nobody gets "entered" (130 > 100).
//   4. A walks to x 290 (90 px): both get "entered".
//   5. A walks to x 330 (130 px) while connected: nobody gets "left" (130 <= 140, the gap).
//   6. A walks to x 400 (200 px): both get "left".
//   7. A walks to x 290 (connected again), then B disconnects: A gets "left" with B's id.
//   8. A walks to (600, 600); C joins and walks to (800, 800): nobody gets "entered" for C.
// If any check fails, the script exits with code 1.

import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { AUDIO_MODES, DEFAULT_SPAWN, DISCONNECT_PX, EARSHOT_PX } from '../../shared/constants.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// How long to wait for world:init before calling it a failure.
const WAIT_MS = 1000;

// Check 1: both players must get "entered" this fast after joining.
const JOIN_WAIT_MS = 1000;

// After each step, wait this long for peers:update messages. The tick runs every 250 ms,
// so 700 ms covers at least two ticks.
const STEP_WAIT_MS = 700;

// A walks along B's row (y = spawn y), so distance = A's x - spawn x.
const ROW_Y = DEFAULT_SPAWN.y;
const FAR_X = DEFAULT_SPAWN.x + 200; // 200 px: beyond DISCONNECT_PX
const GAP_X = DEFAULT_SPAWN.x + 130; // 130 px: between EARSHOT_PX and DISCONNECT_PX
const NEAR_X = DEFAULT_SPAWN.x + 90; // 90 px: within EARSHOT_PX

let failures = 0;

/** Print one PASS or FAIL line, and count the failures. */
function check(name, passed, detail) {
  if (passed) {
    console.log(`[tick-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[tick-test] FAIL  ${name}  (${detail})`);
  }
}

/**
 * Connect one fake client. Every peers:update it receives goes into `client.inbox`,
 * so each step can look at exactly what arrived during that step.
 */
function createFakeClient(label) {
  const socket = io(SERVER_URL, { reconnection: false });
  socket.on('connect_error', (error) => {
    console.error(`[tick-test] ${label} could not connect to ${SERVER_URL}: ${error.message}`);
    console.error('[tick-test] Is the server running? Start it with `npm run dev` inside server/.');
    process.exit(1);
  });

  const client = { label, socket, id: null, inbox: [] };
  socket.on(EVENTS.PEERS_UPDATE, (update) => {
    client.inbox.push(update);
  });
  return client;
}

/** Wait for one event on a socket, or reject after `timeoutMs`. */
function waitFor(socket, eventName, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`no ${eventName} within ${timeoutMs} ms`));
    }, timeoutMs);

    function onEvent(data) {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(data);
    }

    socket.on(eventName, onEvent);
  });
}

/** Join with a name and remember our own id (selfId from world:init). */
async function join(client) {
  const initArrives = waitFor(client.socket, EVENTS.WORLD_INIT, WAIT_MS);
  client.socket.emit(EVENTS.JOIN, { name: client.label });
  const init = await initArrives;
  client.id = init.selfId;
}

/** A promise that resolves after `ms` milliseconds. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Empty every inbox, do `action`, wait `waitMs`, so the inboxes hold only this step's messages. */
async function step(clients, action, waitMs = STEP_WAIT_MS) {
  for (const client of clients) {
    client.inbox = [];
  }
  await action();
  await pause(waitMs);
}

/** Every id listed in "entered" across all messages in this client's inbox. */
function enteredIds(client) {
  return client.inbox.flatMap((update) => update.entered.map((entry) => entry.id));
}

/** Every id listed in "left" across all messages in this client's inbox. */
function leftIds(client) {
  return client.inbox.flatMap((update) => update.left);
}

/** How many times `id` appears in `list`. */
function countOf(list, id) {
  return list.filter((item) => item === id).length;
}

/** Move a client to (x, ROW_Y) facing right. */
function moveTo(client, x, y = ROW_Y) {
  client.socket.emit(EVENTS.MOVE, { x, y, dir: 'right' });
}

/** Check: `client` got `otherId` in "entered" exactly once in this step, with mode falloff. */
function checkEnteredOnce(name, client, other) {
  const count = countOf(enteredIds(client), other.id);
  const entry = client.inbox.flatMap((update) => update.entered).find((item) => item.id === other.id);
  check(
    name,
    count === 1 && entry !== undefined && entry.mode === AUDIO_MODES.FALLOFF,
    `${other.label} appeared ${count} time(s) in entered; inbox ${JSON.stringify(client.inbox)}`,
  );
}

/** Check: `client` got `otherId` in "left" exactly once in this step. */
function checkLeftOnce(name, client, other) {
  const count = countOf(leftIds(client), other.id);
  check(name, count === 1, `${other.label} appeared ${count} time(s) in left; inbox ${JSON.stringify(client.inbox)}`);
}

/** Check: `client` did NOT get `otherId` in the given list ('entered' or 'left') in this step. */
function checkNone(name, client, other, listName) {
  const ids = listName === 'entered' ? enteredIds(client) : leftIds(client);
  check(name, !ids.includes(other.id), `got ${listName} for ${other.label}; inbox ${JSON.stringify(client.inbox)}`);
}

async function main() {
  const a = createFakeClient('A');
  const b = createFakeClient('B');
  const both = [a, b];

  console.log(`[tick-test] EARSHOT_PX ${EARSHOT_PX}, DISCONNECT_PX ${DISCONNECT_PX}, B stays at (${DEFAULT_SPAWN.x}, ${ROW_Y})`);

  // ---- Check 1: both join at the spawn point (0 px) → both get "entered", once each ----
  try {
    await step(
      both,
      async () => {
        await join(a);
        await join(b);
      },
      JOIN_WAIT_MS,
    );
  } catch (error) {
    console.error(`[tick-test] Could not join: ${error.message}. Stopping.`);
    process.exit(1);
  }
  checkEnteredOnce('1a. join at 0 px: A gets entered [B] once, mode falloff', a, b);
  checkEnteredOnce('1b. join at 0 px: B gets entered [A] once, mode falloff', b, a);
  const firstUpdate = a.inbox[0];
  check(
    '1c. peers:update has the contract shape { entered, left, changed: [] }',
    firstUpdate !== undefined &&
      Array.isArray(firstUpdate.entered) &&
      Array.isArray(firstUpdate.left) &&
      Array.isArray(firstUpdate.changed) &&
      firstUpdate.changed.length === 0,
    `got ${JSON.stringify(firstUpdate)}`,
  );

  // ---- Check 2: A walks to 200 px → both get "left" ----
  await step(both, () => moveTo(a, FAR_X));
  checkLeftOnce(`2a. A at ${FAR_X - DEFAULT_SPAWN.x} px: A gets left [B]`, a, b);
  checkLeftOnce(`2b. A at ${FAR_X - DEFAULT_SPAWN.x} px: B gets left [A]`, b, a);

  // ---- Check 3: A walks to 130 px while NOT connected → nobody gets "entered" ----
  await step(both, () => moveTo(a, GAP_X));
  checkNone(`3a. A at ${GAP_X - DEFAULT_SPAWN.x} px, not connected: A gets no entered`, a, b, 'entered');
  checkNone(`3b. A at ${GAP_X - DEFAULT_SPAWN.x} px, not connected: B gets no entered`, b, a, 'entered');

  // ---- Check 4: A walks to 90 px → both get "entered" ----
  await step(both, () => moveTo(a, NEAR_X));
  checkEnteredOnce(`4a. A at ${NEAR_X - DEFAULT_SPAWN.x} px: A gets entered [B]`, a, b);
  checkEnteredOnce(`4b. A at ${NEAR_X - DEFAULT_SPAWN.x} px: B gets entered [A]`, b, a);

  // ---- Check 5: A walks back to 130 px while connected → nobody gets "left" (the gap) ----
  await step(both, () => moveTo(a, GAP_X));
  checkNone(`5a. A at ${GAP_X - DEFAULT_SPAWN.x} px, connected: A gets no left`, a, b, 'left');
  checkNone(`5b. A at ${GAP_X - DEFAULT_SPAWN.x} px, connected: B gets no left`, b, a, 'left');

  // ---- Check 6: A walks to 200 px → both get "left" ----
  await step(both, () => moveTo(a, FAR_X));
  checkLeftOnce(`6a. A at ${FAR_X - DEFAULT_SPAWN.x} px: A gets left [B]`, a, b);
  checkLeftOnce(`6b. A at ${FAR_X - DEFAULT_SPAWN.x} px: B gets left [A]`, b, a);

  // ---- Check 7: connect again, then B disconnects → A gets "left" [B] ----
  await step(both, () => moveTo(a, NEAR_X));
  checkEnteredOnce('7a. A back at 90 px: A gets entered [B]', a, b);
  await step([a], () => b.socket.disconnect());
  checkLeftOnce('7b. B disconnects: A gets left [B]', a, b);
  const leaveUpdate = a.inbox[0];
  check(
    '7c. that peers:update is exactly { entered: [], left: [B], changed: [] }',
    leaveUpdate !== undefined &&
      leaveUpdate.entered.length === 0 &&
      leaveUpdate.left.length === 1 &&
      leaveUpdate.changed.length === 0,
    `got ${JSON.stringify(leaveUpdate)}`,
  );

  // ---- Check 8: a far-away player C → nobody gets "entered" for C ----
  // C must join at the spawn point (200, 200). If A were still at 290, C would be 90 px
  // from A on join and correctly get "entered". So A walks away first.
  const c = createFakeClient('C');
  await step([a], () => moveTo(a, 600, 600));
  await step([a, c], async () => {
    await join(c); // at spawn (200, 200): about 566 px from A
    moveTo(c, 800, 800); // about 283 px from A
  });
  checkNone('8a. C far away: A gets no entered for C', a, c, 'entered');
  check('8b. C far away: C gets no peers:update at all', c.inbox.length === 0, `C got ${JSON.stringify(c.inbox)}`);

  a.socket.disconnect();
  c.socket.disconnect();

  if (failures > 0) {
    console.log(`[tick-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[tick-test] all checks passed');
}

main();
