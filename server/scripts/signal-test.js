// server/scripts/signal-test.js — Person 1 (Module 1: Signaling + WebRTC)
// A small test that pretends to be browsers, to check the WebRTC note passing (Task 8):
// the server relays EVENTS.SIGNAL only between peers in earshot, writes `from` itself,
// and refuses bad notes with SERVER_ERROR.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/signal-test.js
//
// The notes here are fake (the sdp is just text). The server never reads the SDP,
// it only checks the shape and who the note is for, so fake text is enough.
//
// What it checks (each line prints PASS or FAIL):
//   1. A → B offer reaches B with from = A's id and exactly the same data.
//   2. A forged `from: 'hacker'` in A's payload is ignored: B still sees A's real id.
//   3. A B → A answer and a B → A candidate both reach A.
//   4. A signal to an id nobody has → BAD_SIGNAL.
//   5. C joins and walks to (800, 800). A → C → BAD_SIGNAL (not in earshot), and C gets nothing.
//   6. Bad payloads (missing `to`, data.type 'nonsense', null) → BAD_SIGNAL each.
//   7. A signal from a socket that never joined → NOT_JOINED.
// If any check fails, the script exits with code 1.

import { isDeepStrictEqual } from 'node:util';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { ERROR_CODES } from '../../shared/constants.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// How long to wait for world:init, a delivered signal, or a server:error.
const WAIT_MS = 1000;

// After joining at the same spot, wait this long for the tick (every 250 ms) to make
// A and B peers. 700 ms covers at least two ticks.
const PEER_WAIT_MS = 700;

// How long to wait to be sure something did NOT arrive.
const QUIET_MS = 500;

// Fake notes. Real ones come from the browser's RTCPeerConnection.
const FAKE_OFFER = { type: 'offer', sdp: 'v=0 fake offer from A' };
const FAKE_ANSWER = { type: 'answer', sdp: 'v=0 fake answer from B' };
const FAKE_CANDIDATE = {
  type: 'candidate',
  candidate: { candidate: 'candidate:1 1 udp 2122260223 192.168.1.5 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 },
};

let failures = 0;

/** Print one PASS or FAIL line, and count the failures. */
function check(name, passed, detail) {
  if (passed) {
    console.log(`[signal-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[signal-test] FAIL  ${name}  (${detail})`);
  }
}

/** Connect one fake client. It stops the script if the server can't be reached. */
function createFakeClient(label) {
  const socket = io(SERVER_URL, { reconnection: false });
  socket.on('connect_error', (error) => {
    console.error(`[signal-test] ${label} could not connect to ${SERVER_URL}: ${error.message}`);
    console.error('[signal-test] Is the server running? Start it with `npm run dev` inside server/.');
    process.exit(1);
  });
  return { label, socket, id: null };
}

/**
 * Wait for the next `eventName` on a socket. Resolves with its payload,
 * or with null if nothing arrives within `timeoutMs` (so a test can check "nothing came").
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

/** Join with a name and remember our own id (selfId from world:init). */
async function join(client) {
  const initArrives = nextEvent(client.socket, EVENTS.WORLD_INIT);
  client.socket.emit(EVENTS.JOIN, { name: client.label });
  const init = await initArrives;
  if (init === null) {
    throw new Error(`${client.label} got no world:init within ${WAIT_MS} ms`);
  }
  client.id = init.selfId;
}

/** A promise that resolves after `ms` milliseconds. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send `payload` as EVENTS.SIGNAL from `sender`, and check that the server answers
 * with SERVER_ERROR whose code is `expectedCode`.
 */
async function expectError(name, sender, payload, expectedCode) {
  const errorArrives = nextEvent(sender.socket, EVENTS.SERVER_ERROR);
  sender.socket.emit(EVENTS.SIGNAL, payload);
  const error = await errorArrives;
  check(
    name,
    error !== null && error.code === expectedCode,
    `expected ${expectedCode}, got ${JSON.stringify(error)}`,
  );
  if (error !== null) {
    console.log(`[signal-test]        server said: ${error.message}`);
  }
}

async function main() {
  const a = createFakeClient('A');
  const b = createFakeClient('B');

  // ---- Setup: A and B join at the same spawn point, so the tick makes them peers ----
  try {
    await join(a);
    await join(b);
  } catch (error) {
    console.error(`[signal-test] Could not join: ${error.message}. Stopping.`);
    process.exit(1);
  }
  await pause(PEER_WAIT_MS);
  console.log(`[signal-test] A = ${a.id}, B = ${b.id} (same spot, so they should be peers now)`);

  // ---- Check 1: A → B offer arrives with A's real id and the same data ----
  let arrives = nextEvent(b.socket, EVENTS.SIGNAL);
  a.socket.emit(EVENTS.SIGNAL, { to: b.id, data: FAKE_OFFER });
  let delivered = await arrives;
  check(
    '1. A → B offer: B gets { from: A, data } with identical data',
    delivered !== null && delivered.from === a.id && isDeepStrictEqual(delivered.data, FAKE_OFFER),
    `got ${JSON.stringify(delivered)}`,
  );

  // ---- Check 2: a forged `from` is ignored ----
  arrives = nextEvent(b.socket, EVENTS.SIGNAL);
  a.socket.emit(EVENTS.SIGNAL, { to: b.id, from: 'hacker', data: FAKE_OFFER });
  delivered = await arrives;
  check(
    "2. forged from: 'hacker' is ignored: B sees A's real id",
    delivered !== null && delivered.from === a.id,
    `got ${JSON.stringify(delivered)}`,
  );

  // ---- Check 3: B → A answer and candidate ----
  arrives = nextEvent(a.socket, EVENTS.SIGNAL);
  b.socket.emit(EVENTS.SIGNAL, { to: a.id, data: FAKE_ANSWER });
  delivered = await arrives;
  check(
    '3a. B → A answer is delivered with from = B',
    delivered !== null && delivered.from === b.id && isDeepStrictEqual(delivered.data, FAKE_ANSWER),
    `got ${JSON.stringify(delivered)}`,
  );

  arrives = nextEvent(a.socket, EVENTS.SIGNAL);
  b.socket.emit(EVENTS.SIGNAL, { to: a.id, data: FAKE_CANDIDATE });
  delivered = await arrives;
  check(
    '3b. B → A candidate is delivered with from = B',
    delivered !== null && delivered.from === b.id && isDeepStrictEqual(delivered.data, FAKE_CANDIDATE),
    `got ${JSON.stringify(delivered)}`,
  );

  // ---- Check 4: unknown receiver ----
  await expectError('4. signal to an unknown id → BAD_SIGNAL', a, { to: 'nobody-has-this-id', data: FAKE_OFFER }, ERROR_CODES.BAD_SIGNAL);

  // ---- Check 5: C is online but far away (not a peer) ----
  const c = createFakeClient('C');
  await join(c);
  c.socket.emit(EVENTS.MOVE, { x: 800, y: 800, dir: 'right' }); // about 850 px from A and B
  await pause(PEER_WAIT_MS);
  const cGetsSomething = nextEvent(c.socket, EVENTS.SIGNAL, QUIET_MS);
  await expectError('5a. A → C while C is far away → BAD_SIGNAL (not in earshot)', a, { to: c.id, data: FAKE_OFFER }, ERROR_CODES.BAD_SIGNAL);
  const cGot = await cGetsSomething;
  check('5b. C received no signal', cGot === null, `C got ${JSON.stringify(cGot)}`);

  // ---- Check 6: bad payloads ----
  await expectError('6a. missing `to` → BAD_SIGNAL', a, { data: FAKE_OFFER }, ERROR_CODES.BAD_SIGNAL);
  await expectError("6b. data.type 'nonsense' → BAD_SIGNAL", a, { to: b.id, data: { type: 'nonsense' } }, ERROR_CODES.BAD_SIGNAL);
  await expectError('6c. null payload → BAD_SIGNAL', a, null, ERROR_CODES.BAD_SIGNAL);

  // ---- Check 7: a socket that never joined ----
  const stranger = createFakeClient('Stranger');
  await expectError('7. signal before joining → NOT_JOINED', stranger, { to: a.id, data: FAKE_OFFER }, ERROR_CODES.NOT_JOINED);

  for (const client of [a, b, c, stranger]) {
    client.socket.disconnect();
  }

  if (failures > 0) {
    console.log(`[signal-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[signal-test] all checks passed');
}

main();
