// server/scripts/reconnect-test.js — Person 1 (Module 1: Signaling + WebRTC)
// A small test that pretends to be browsers, to check what happens when a connection drops
// and comes back (Task 11): a network blip, a closed tab and a refreshed tab.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/reconnect-test.js
//
// A's fake browser does what client/src/net does: Socket.io reconnects by itself, and when it
// does, A sends EVENTS.JOIN again with the same name. (The real net file can't run in Node,
// because it uses Vite features, so this script copies the idea in a few lines.)
//
// What it checks (each line prints PASS or FAIL):
//   1. After the blip, A gets a NEW world:init, with a new selfId (its new socket id).
//   2. B gets player:left for A's OLD id.
//   3. B gets player:joined for A's NEW id, with A's name.
//   4. B's peers:update lists A's old id in `left`.
//   5. B's peers:update lists A's new id in `entered` (they are still at the same spot).
//   6. A closes the tab: B gets player:left and peers:update `left` for A's id.
//   7. A "refreshes" (a brand-new connection joins): B gets player:joined and peers:update `entered`.
// If any check fails, the script exits with code 1.

import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// How long to wait for world:init.
const WAIT_MS = 1000;

// How long A may take to notice the drop, reconnect and get world:init again.
const REJOIN_WAIT_MS = 5000;

// After a join (or re-join) at the same spot, wait this long for the tick (every 250 ms)
// to make the pair peers. 700 ms covers at least two ticks.
const PEER_WAIT_MS = 700;

// Make A's automatic reconnect quick, so the test doesn't wait for the default 1–5 seconds.
const RECONNECT_DELAY_MS = 200;

let failures = 0;

/** Print one PASS or FAIL line, and count the failures. */
function check(name, passed, detail) {
  if (passed) {
    console.log(`[reconnect-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[reconnect-test] FAIL  ${name}  (${detail})`);
  }
}

/**
 * Connect one fake client. It stops the script if the server can't be reached the first time.
 * With `reconnect: true` Socket.io dials again by itself after a drop (like the real browser),
 * and the client joins again with the same name (like client/src/net does).
 */
function createFakeClient(label, { reconnect }) {
  const socket = io(SERVER_URL, {
    reconnection: reconnect,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: RECONNECT_DELAY_MS,
  });
  const client = { label, socket, id: null, hasJoined: false };

  socket.on('connect_error', (error) => {
    if (client.hasJoined) {
      return; // during a reconnect a failed try is normal; Socket.io tries again
    }
    console.error(`[reconnect-test] ${label} could not connect to ${SERVER_URL}: ${error.message}`);
    console.error('[reconnect-test] Is the server running? Start it with `npm run dev` inside server/.');
    process.exit(1);
  });

  // The re-join: if this client had joined before, a new 'connect' means "join again".
  socket.on('connect', () => {
    if (client.hasJoined) {
      console.log(`[reconnect-test] ${label} reconnected as ${socket.id}; sending ${EVENTS.JOIN} again`);
      socket.emit(EVENTS.JOIN, { name: label });
    }
  });

  return client;
}

/**
 * Wait for the next `eventName` on a socket. Resolves with its payload,
 * or with null if nothing arrives within `timeoutMs`.
 */
function nextEvent(socket, eventName, timeoutMs = WAIT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      resolve(null);
    }, timeoutMs);

    function onEvent(data) {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(data);
    }

    socket.on(eventName, onEvent);
  });
}

/** Join with the client's label as its name, and remember its id (selfId from world:init). */
async function join(client) {
  const initArrives = nextEvent(client.socket, EVENTS.WORLD_INIT);
  client.socket.emit(EVENTS.JOIN, { name: client.label });
  const init = await initArrives;
  if (init === null) {
    throw new Error(`${client.label} got no world:init within ${WAIT_MS} ms`);
  }
  client.id = init.selfId;
  client.hasJoined = true;
}

/**
 * Write down everything B receives about other players from now on, so the checks can look
 * through it afterwards. The messages may arrive in any order and in several peers:update
 * messages (the "left" comes at once on disconnect; the "entered" comes with the next tick).
 */
function startRecording(socket) {
  const record = { joined: [], left: [], peersUpdates: [] };
  socket.on(EVENTS.PLAYER_JOINED, (data) => record.joined.push(data));
  socket.on(EVENTS.PLAYER_LEFT, (data) => record.left.push(data));
  socket.on(EVENTS.PEERS_UPDATE, (data) => record.peersUpdates.push(data));
  return record;
}

/** Forget everything recorded so far (before the next part of the test). */
function clearRecording(record) {
  record.joined.length = 0;
  record.left.length = 0;
  record.peersUpdates.length = 0;
}

/** Did any recorded peers:update list `id` in `left`? */
function peersLeftIncludes(record, id) {
  return record.peersUpdates.some((update) => update.left.includes(id));
}

/** Did any recorded peers:update list `id` in `entered`? */
function peersEnteredIncludes(record, id) {
  return record.peersUpdates.some((update) => update.entered.some((entry) => entry.id === id));
}

/** A promise that resolves after `ms` milliseconds. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const a = createFakeClient('A', { reconnect: true });
  const b = createFakeClient('B', { reconnect: false });

  // ---- Setup: A and B join at the same spawn point, so the tick makes them peers ----
  try {
    await join(a);
    await join(b);
  } catch (error) {
    console.error(`[reconnect-test] Could not join: ${error.message}. Stopping.`);
    process.exit(1);
  }
  await pause(PEER_WAIT_MS);
  const oldId = a.id;
  console.log(`[reconnect-test] A = ${oldId}, B = ${b.id} (same spot, so they should be peers now)`);

  // ---- The blip: cut A's connection without telling Socket.io "I meant to" ----
  // engine.close() closes the network connection underneath the socket, like wifi dropping.
  // Socket.io sees an unexpected close and reconnects by itself, on the same socket object.
  const record = startRecording(b.socket);
  const newInitArrives = nextEvent(a.socket, EVENTS.WORLD_INIT, REJOIN_WAIT_MS);
  console.log('[reconnect-test] cutting A\'s connection (network blip)...');
  a.socket.io.engine.close();

  const newInit = await newInitArrives;
  await pause(PEER_WAIT_MS);
  const newId = newInit?.selfId;
  if (newInit !== null) {
    a.id = newId;
    console.log(`[reconnect-test] A re-joined as ${newId}`);
  }

  // ---- Checks 1–5 ----
  check(
    '1. A gets a new world:init with a new selfId',
    newInit !== null && newId !== oldId && newId === a.socket.id,
    newInit === null ? `no world:init within ${REJOIN_WAIT_MS} ms` : `old ${oldId}, new ${newId}, socket ${a.socket.id}`,
  );
  check(
    "2. B gets player:left for A's old id",
    record.left.some((entry) => entry.id === oldId),
    `B got player:left ${JSON.stringify(record.left)}`,
  );
  check(
    "3. B gets player:joined for A's new id",
    record.joined.some((entry) => entry.id === newId && entry.name === a.label),
    `B got player:joined ${JSON.stringify(record.joined)}`,
  );
  check(
    "4. B's peers:update lists A's old id in left",
    peersLeftIncludes(record, oldId),
    `B got peers:update ${JSON.stringify(record.peersUpdates)}`,
  );
  check(
    "5. B's peers:update lists A's new id in entered",
    newId !== undefined && peersEnteredIncludes(record, newId),
    `B got peers:update ${JSON.stringify(record.peersUpdates)}`,
  );

  // ---- Check 6: A closes the tab ----
  // socket.disconnect() is a deliberate hang-up, so Socket.io does NOT reconnect.
  clearRecording(record);
  console.log('[reconnect-test] A closes the tab...');
  a.socket.disconnect();
  await pause(PEER_WAIT_MS);
  check(
    '6. tab closed: B gets player:left and peers:update left for A',
    record.left.some((entry) => entry.id === newId) && peersLeftIncludes(record, newId),
    `player:left ${JSON.stringify(record.left)}, peers:update ${JSON.stringify(record.peersUpdates)}`,
  );

  // ---- Check 7: A refreshes the page ----
  // A refreshed tab is a brand-new connection that joins like anyone else.
  clearRecording(record);
  console.log('[reconnect-test] A refreshes the page (a new connection joins)...');
  const refreshed = createFakeClient('A', { reconnect: false });
  try {
    await join(refreshed);
  } catch (error) {
    check('7. refreshed tab joins cleanly', false, error.message);
  }
  await pause(PEER_WAIT_MS);
  if (refreshed.id !== null) {
    check(
      '7. refreshed tab joins as a new player: B gets player:joined and peers:update entered',
      refreshed.id !== newId &&
        record.joined.some((entry) => entry.id === refreshed.id) &&
        peersEnteredIncludes(record, refreshed.id),
      `id ${refreshed.id}, player:joined ${JSON.stringify(record.joined)}, peers:update ${JSON.stringify(record.peersUpdates)}`,
    );
  }

  for (const client of [b, refreshed]) {
    client.socket.disconnect();
  }

  if (failures > 0) {
    console.log(`[reconnect-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[reconnect-test] all checks passed');
}

main();
