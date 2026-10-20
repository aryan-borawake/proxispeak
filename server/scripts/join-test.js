// server/scripts/join-test.js — Person 1 (Module 1: Signaling + WebRTC)
// A small test that pretends to be browsers, to check the join flow (Task 2).
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/join-test.js
//
// What it does:
//   - Riya connects and joins. She should get world:init with an empty players list.
//   - Sam connects and joins. He should get world:init listing Riya,
//     and Riya should get player:joined about Sam.
//   - A third client tries to join with an empty name. It should get server:error.

import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// If nothing has happened after this long, the server probably isn't running.
const GIVE_UP_AFTER_MS = 5000;

/** Connect one fake client and print every event it receives, labelled with its name. */
function createFakeClient(label) {
  const socket = io(SERVER_URL, { reconnection: false });

  socket.on(EVENTS.WORLD_INIT, (data) => print(label, EVENTS.WORLD_INIT, data));
  socket.on(EVENTS.PLAYER_JOINED, (data) => print(label, EVENTS.PLAYER_JOINED, data));
  socket.on(EVENTS.SERVER_ERROR, (data) => print(label, EVENTS.SERVER_ERROR, data));
  socket.on('connect_error', (error) => {
    console.error(`[join-test] ${label} could not connect to ${SERVER_URL}: ${error.message}`);
    console.error('[join-test] Is the server running? Start it with `npm run dev` inside server/.');
    process.exit(1);
  });

  return socket;
}

function print(label, eventName, data) {
  console.log(`[join-test] ${label} received ${eventName}:`, JSON.stringify(data));
}

/** Wait until this socket receives one event (a Promise that resolves with the payload). */
function waitFor(socket, eventName) {
  return new Promise((resolve) => socket.once(eventName, resolve));
}

async function main() {
  const giveUpTimer = setTimeout(() => {
    console.error(`[join-test] Gave up after ${GIVE_UP_AFTER_MS} ms: an expected event never arrived.`);
    process.exit(1);
  }, GIVE_UP_AFTER_MS);

  // Step 1: Riya joins an empty office.
  const riya = createFakeClient('Riya');
  const riyaInit = waitFor(riya, EVENTS.WORLD_INIT);
  riya.emit(EVENTS.JOIN, { name: 'Riya' });
  await riyaInit;

  // Step 2: Sam joins. Wait for BOTH his world:init and Riya's player:joined.
  const sam = createFakeClient('Sam');
  const samInit = waitFor(sam, EVENTS.WORLD_INIT);
  const riyaHearsSam = waitFor(riya, EVENTS.PLAYER_JOINED);
  sam.emit(EVENTS.JOIN, { name: 'Sam' });
  await Promise.all([samInit, riyaHearsSam]);

  // Step 3: someone tries to join with an empty name. The server should refuse.
  const nobody = createFakeClient('NoName');
  const nobodyError = waitFor(nobody, EVENTS.SERVER_ERROR);
  nobody.emit(EVENTS.JOIN, { name: '   ' });
  await nobodyError;

  // Done: close everything so the server logs the disconnects.
  clearTimeout(giveUpTimer);
  riya.disconnect();
  sam.disconnect();
  nobody.disconnect();
  console.log('[join-test] done: all expected events arrived');
}

main();
