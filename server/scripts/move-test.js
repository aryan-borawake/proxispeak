// server/scripts/move-test.js — Person 1 (Module 1: Signaling + WebRTC)
// A small test that pretends to be browsers, to check moves, the 100 ms broadcast
// and leaving (Task 3).
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev
//   2. In a second terminal, inside server/:   node scripts/move-test.js
//
// What it checks (each line prints PASS or FAIL):
//   1. A move sent before joining gets server:error NOT_JOINED.
//   2. A and B join. A moves to (250, 300) facing right; within 500 ms B gets a
//      players:state showing A there, with a numeric time `t`.
//   3. Six bad moves from A each get server:error BAD_MOVE, and A stays at (250, 300, right).
//   4. B gets about 10 players:state messages a second (8 to 12 counts as a pass).
//   5. A disconnects: B gets player:left with A's id, and A is gone from the next players:state.
// If any check fails, the script exits with code 1.

import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { ERROR_CODES } from '../../shared/constants.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

// How long to wait for one expected message before calling it a failure.
const WAIT_MS = 1000;

// Check 2: B must see A's move this fast.
const MOVE_VISIBLE_WITHIN_MS = 500;

// Check 4: count broadcasts for this long. At one every 100 ms we expect about 10.
const COUNT_FOR_MS = 1000;
const MIN_BROADCASTS = 8;
const MAX_BROADCASTS = 12;

// Where A moves to in check 2. Every bad move in check 3 must leave A here.
const GOOD_MOVE = { x: 250, y: 300, dir: 'right' };

// Each bad move, with a label for the PASS/FAIL line.
const BAD_MOVES = [
  { label: 'x is the text "10"', payload: { x: '10', y: 300, dir: 'right' } },
  // Note: Socket.io turns NaN into null on the way (JSON has no NaN), so the server sees x: null.
  { label: 'x is NaN', payload: { x: NaN, y: 300, dir: 'right' } },
  { label: 'x is -1', payload: { x: -1, y: 300, dir: 'right' } },
  { label: 'y is 5000 (above 4096)', payload: { x: 250, y: 5000, dir: 'right' } },
  { label: 'dir is "sideways"', payload: { x: 250, y: 300, dir: 'sideways' } },
  { label: 'payload is null', payload: null },
];

let failures = 0;

/** Print one PASS or FAIL line, and count the failures. */
function check(name, passed, detail) {
  if (passed) {
    console.log(`[move-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[move-test] FAIL  ${name}  (${detail})`);
  }
}

/** Connect one fake client. If the server isn't running, stop with a clear message. */
function createFakeClient(label) {
  const socket = io(SERVER_URL, { reconnection: false });
  socket.on('connect_error', (error) => {
    console.error(`[move-test] ${label} could not connect to ${SERVER_URL}: ${error.message}`);
    console.error('[move-test] Is the server running? Start it with `npm run dev` inside server/.');
    process.exit(1);
  });
  return socket;
}

/**
 * Wait until this socket receives `eventName` with a payload that passes `matches`.
 * Resolves with the payload, or rejects if nothing matching arrives within `timeoutMs`.
 */
function waitFor(socket, eventName, timeoutMs, matches = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`no matching ${eventName} within ${timeoutMs} ms`));
    }, timeoutMs);

    function onEvent(data) {
      if (!matches(data)) {
        return; // not the one we want; keep listening
      }
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(data);
    }

    socket.on(eventName, onEvent);
  });
}

/** Join with a name and return our own id (selfId from world:init). */
async function join(socket, name) {
  const initArrives = waitFor(socket, EVENTS.WORLD_INIT, WAIT_MS);
  socket.emit(EVENTS.JOIN, { name });
  const init = await initArrives;
  return init.selfId;
}

/** Find one player in a players:state payload, or undefined. */
function findPlayer(state, id) {
  return state.players.find((player) => player.id === id);
}

/** Is this player exactly at GOOD_MOVE? */
function isAtGoodMove(player) {
  return player !== undefined && player.x === GOOD_MOVE.x && player.y === GOOD_MOVE.y && player.dir === GOOD_MOVE.dir;
}

/** A promise that resolves after `ms` milliseconds. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const a = createFakeClient('A');
  const b = createFakeClient('B');

  // ---- Check 1: move before join -> NOT_JOINED ----
  try {
    const errorArrives = waitFor(a, EVENTS.SERVER_ERROR, WAIT_MS);
    a.emit(EVENTS.MOVE, GOOD_MOVE);
    const error = await errorArrives;
    check('1. move before join gives NOT_JOINED', error.code === ERROR_CODES.NOT_JOINED, `got code ${error.code}`);
  } catch (error) {
    check('1. move before join gives NOT_JOINED', false, error.message);
  }

  // Both join. If this fails, nothing else can be tested.
  let aId;
  try {
    aId = await join(a, 'A');
    await join(b, 'B');
  } catch (error) {
    console.error(`[move-test] Could not join: ${error.message}. Stopping.`);
    process.exit(1);
  }

  // ---- Check 2: A's good move reaches B within 500 ms ----
  try {
    const stateArrives = waitFor(b, EVENTS.PLAYERS_STATE, MOVE_VISIBLE_WITHIN_MS, (state) =>
      isAtGoodMove(findPlayer(state, aId)),
    );
    a.emit(EVENTS.MOVE, GOOD_MOVE);
    const state = await stateArrives;
    check(
      `2. B sees A at (${GOOD_MOVE.x}, ${GOOD_MOVE.y}, ${GOOD_MOVE.dir}) with a numeric t`,
      typeof state.t === 'number',
      `t was ${JSON.stringify(state.t)}`,
    );
  } catch (error) {
    check('2. B sees A move within 500 ms', false, error.message);
  }

  // ---- Check 3: each bad move -> BAD_MOVE, position unchanged ----
  for (const badMove of BAD_MOVES) {
    const name = `3. bad move (${badMove.label}) gives BAD_MOVE and A stays put`;
    try {
      const errorArrives = waitFor(a, EVENTS.SERVER_ERROR, WAIT_MS);
      a.emit(EVENTS.MOVE, badMove.payload);
      const error = await errorArrives;

      // The error arrived, so the server has handled the bad move. The next broadcast shows the result.
      const state = await waitFor(b, EVENTS.PLAYERS_STATE, WAIT_MS);
      const playerA = findPlayer(state, aId);

      const codeOk = error.code === ERROR_CODES.BAD_MOVE;
      const positionOk = isAtGoodMove(playerA);
      check(name, codeOk && positionOk, `code ${error.code}, A is ${JSON.stringify(playerA)}`);
    } catch (error) {
      check(name, false, error.message);
    }
  }

  // ---- Check 4: about 10 broadcasts a second ----
  let broadcastCount = 0;
  const countOne = () => {
    broadcastCount += 1;
  };
  b.on(EVENTS.PLAYERS_STATE, countOne);
  await pause(COUNT_FOR_MS);
  b.off(EVENTS.PLAYERS_STATE, countOne);
  check(
    `4. B got ${broadcastCount} players:state in ${COUNT_FOR_MS} ms (want ${MIN_BROADCASTS} to ${MAX_BROADCASTS})`,
    broadcastCount >= MIN_BROADCASTS && broadcastCount <= MAX_BROADCASTS,
    'outside the expected range',
  );

  // ---- Check 5: A leaves -> player:left, then gone from players:state ----
  try {
    const leftArrives = waitFor(b, EVENTS.PLAYER_LEFT, WAIT_MS);
    a.disconnect();
    const left = await leftArrives;
    check('5a. B gets player:left with A\'s id', left.id === aId, `got id ${left.id}, expected ${aId}`);

    const state = await waitFor(b, EVENTS.PLAYERS_STATE, WAIT_MS);
    const playerA = findPlayer(state, aId);
    check('5b. A is gone from the next players:state', playerA === undefined, `A is still there: ${JSON.stringify(playerA)}`);
  } catch (error) {
    check('5. A leaves', false, error.message);
  }

  b.disconnect();

  if (failures > 0) {
    console.log(`[move-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[move-test] all checks passed');
}

main();
