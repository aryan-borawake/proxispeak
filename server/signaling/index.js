// server/signaling/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The server half of Module 1: the player list, join/move/leave, the 100 ms position
// broadcast, the 250 ms proximity tick and the WebRTC note passing.
// Exact names and payloads: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// Built so far: join and disconnect (Task 2); MOVE, the PLAYERS_STATE broadcast and
// PLAYER_LEFT (Task 3); the proximity tick (Task 6, tick.js); SIGNAL note passing between
// peers in earshot (Task 8); Person 2's geo engine, with fakeNearby.js as the fallback (Task 9).

import { EVENTS } from '../../shared/events.js';
import {
  DEFAULT_ROOM,
  DEFAULT_SPAWN,
  DIRECTIONS,
  ERROR_CODES,
  STATE_BROADCAST_MS,
  WORLD_MAX_PX,
} from '../../shared/constants.js';
import { addPlayer, removePlayer, getPlayer, listPlayers, updatePlayerPosition } from './players.js';
import { startProximityTick, removeFromPeers, arePeers } from './tick.js';

// New players face down (towards the screen) when they appear. One of DIRECTIONS.
const SPAWN_DIR = 'down';

// The three kinds of WebRTC note a browser may put inside EVENTS.SIGNAL (CONTRACTS.md, section 4).
// These are WebRTC's own names for the notes, not event names.
const SIGNAL_TYPES = Object.freeze(['offer', 'answer', 'candidate']);

/**
 * Plug all Socket.io event handlers into the server.
 * Handles EVENTS.JOIN, EVENTS.MOVE, EVENTS.SIGNAL and disconnects, and sends
 * EVENTS.WORLD_INIT, EVENTS.PLAYER_JOINED, EVENTS.PLAYERS_STATE (every STATE_BROADCAST_MS),
 * EVENTS.PLAYER_LEFT, EVENTS.PEERS_UPDATE (tick every PROXIMITY_TICK_MS) and EVENTS.SERVER_ERROR.
 *
 * @param {import('socket.io').Server} io - the Socket.io server
 * @param {{ geo: object | null }} options - geo is Person 2's engine from createGeoEngine(),
 *   or null when it isn't available (then the tick uses the fake, fakeNearby.js)
 * @returns {void}
 */
export function attachSignaling(io, { geo }) {
  // This runs once for every browser that connects.
  io.on('connection', (socket) => {
    console.log(`[signaling] socket connected: ${socket.id}`);

    socket.on(EVENTS.JOIN, (payload) => {
      handleJoin(socket, payload);
    });

    socket.on(EVENTS.MOVE, (payload) => {
      handleMove(socket, payload);
    });

    socket.on(EVENTS.SIGNAL, (payload) => {
      handleSignal(io, socket, payload);
    });

    socket.on('disconnect', () => {
      handleDisconnect(io, socket, geo);
    });
  });

  // One timer for the whole server (not one per player), started once, here.
  startStateBroadcast(io);

  // The "who is near whom?" check, every PROXIMITY_TICK_MS (250 ms). Also one timer, started once.
  // geo goes to the tick: it uses Person 2's engine if we have one, otherwise the fake.
  startProximityTick(io, geo);

  console.log('[signaling] ready: listening for joins, moves and signals');
}

/**
 * A browser sent EVENTS.JOIN with { name }.
 * Check the name, add the player, put them in the room, and tell everyone.
 */
function handleJoin(socket, payload) {
  // 1. Don't let the same tab join twice.
  if (getPlayer(socket.id)) {
    sendError(socket, ERROR_CODES.ALREADY_JOINED, 'You have already joined. Refresh the page to join again.');
    return;
  }

  // 2. Validate: never trust data from a browser. The payload might be missing,
  //    or name might be a number, an empty string, or just spaces.
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (name === '') {
    sendError(socket, ERROR_CODES.BAD_NAME, 'Join needs a name: send { name: "Riya" } with a non-empty string.');
    return;
  }

  // 3. Remember who was already here BEFORE adding the new player,
  //    so the new player's list doesn't include themselves.
  //    We copy only the contract's fields, so server-only fields (like `moved`) never leave the server.
  const playersAlreadyHere = listPlayers().map(toJoinedShape);

  // 4. Add the player at the spawn point.
  const player = addPlayer({
    id: socket.id,
    name,
    x: DEFAULT_SPAWN.x,
    y: DEFAULT_SPAWN.y,
    dir: SPAWN_DIR,
  });

  // 5. Put this socket in the office room, so room-wide messages reach it.
  socket.join(DEFAULT_ROOM);

  // 6. Reply to the new player only: who you are, where you start, who is here.
  socket.emit(EVENTS.WORLD_INIT, {
    selfId: socket.id,
    roomId: DEFAULT_ROOM,
    spawn: { x: DEFAULT_SPAWN.x, y: DEFAULT_SPAWN.y },
    players: playersAlreadyHere,
  });

  // 7. Tell everyone else in the room. `socket.to(room)` means "the room, except me".
  socket.to(DEFAULT_ROOM).emit(EVENTS.PLAYER_JOINED, toJoinedShape(player));

  console.log(`[signaling] player joined: ${name} (${socket.id}), ${listPlayers().length} in ${DEFAULT_ROOM}`);
}

/**
 * A browser sent EVENTS.MOVE with { x, y, dir }.
 * Check it, then store the new position. We don't reply and don't forward it:
 * the 100 ms broadcast (startStateBroadcast) sends everyone's positions to everyone.
 *
 * We don't rate-limit here. If a browser sends 30 moves a second, each one just
 * overwrites the last, and the broadcast still goes out only 10 times a second.
 */
function handleMove(socket, payload) {
  // 1. Only players who joined have a position to move.
  if (!getPlayer(socket.id)) {
    sendError(socket, ERROR_CODES.NOT_JOINED, 'Join first: send EVENTS.JOIN with { name } before sending moves.');
    return;
  }

  // 2. Validate: never trust data from a browser. On bad data we keep the old position.
  if (!isValidMove(payload)) {
    sendError(
      socket,
      ERROR_CODES.BAD_MOVE,
      `Move ignored: send { x, y, dir } where x and y are numbers from 0 to ${WORLD_MAX_PX} ` +
        `and dir is one of ${DIRECTIONS.join(', ')}.`,
    );
    return;
  }

  // 3. Store only x, y and dir (players.js copies them one by one).
  updatePlayerPosition(socket.id, { x: payload.x, y: payload.y, dir: payload.dir });
}

/**
 * Is this a well-formed move payload?
 * Example: { x: 250, y: 300, dir: 'right' } → true
 *          { x: '10', y: 300, dir: 'right' } → false (x is text, not a number)
 *          { x: 250, y: 5000, dir: 'right' } → false (y is outside the map)
 *          null → false
 */
function isValidMove(payload) {
  // typeof null is 'object' in JavaScript, so we check for null separately.
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  if (!isCoordinate(payload.x) || !isCoordinate(payload.y)) {
    return false;
  }
  return DIRECTIONS.includes(payload.dir);
}

/**
 * Is this value a usable x or y?
 * It must be a real number type (the text '10' is refused), finite (NaN and Infinity
 * are refused), and inside the map: 0 to WORLD_MAX_PX, both ends allowed.
 */
function isCoordinate(value) {
  if (typeof value !== 'number') {
    return false;
  }
  if (!Number.isFinite(value)) {
    return false;
  }
  return value >= 0 && value <= WORLD_MAX_PX;
}

/**
 * A browser sent EVENTS.SIGNAL with { to, data }: a WebRTC setup note for one other browser.
 * We check it, then pass it on as { from, data } to that one browser only.
 * We never read the note itself (the SDP text); we only check its shape and who it's for.
 *
 * Example: Riya ('a1') sends { to: 'b7', data: { type: 'offer', sdp: 'v=0...' } }
 *          → Sam ('b7') gets { from: 'a1', data: { type: 'offer', sdp: 'v=0...' } }
 *
 * Why only between peers? Two browsers should set up a voice connection only when they are
 * in earshot (the tick put them in each other's peer set). This also stops one browser
 * sending notes to anyone in the office (CONTRACTS.md, section 5, rule 5).
 */
function handleSignal(io, socket, payload) {
  // 1. Only players who joined can send notes.
  if (!getPlayer(socket.id)) {
    sendError(socket, ERROR_CODES.NOT_JOINED, 'Join first: send EVENTS.JOIN with { name } before sending signals.');
    return;
  }

  // 2. Check the shape. describeSignalProblem gives back null if it's fine, or the reason it isn't.
  const problem = describeSignalProblem(payload);
  if (problem !== null) {
    sendError(
      socket,
      ERROR_CODES.BAD_SIGNAL,
      `Signal ignored: ${problem}. Send { to, data } where data is { type: 'offer' | 'answer', sdp } ` +
        `or { type: 'candidate', candidate }.`,
    );
    return;
  }

  const { to, data } = payload;

  // 3. The receiver must be in the office right now.
  if (!getPlayer(to)) {
    sendError(socket, ERROR_CODES.BAD_SIGNAL, `Signal not delivered: no player with id "${to}" is online.`);
    return;
  }

  // 4. ...and must be in the sender's peer set (within earshot). This also refuses
  //    "send to myself", because nobody is in their own peer set.
  if (!arePeers(socket.id, to)) {
    sendError(
      socket,
      ERROR_CODES.BAD_SIGNAL,
      `Signal not delivered: player "${to}" is not within earshot of you. ` +
        `Only send signals to people you got in ${EVENTS.PEERS_UPDATE} "entered".`,
    );
    return;
  }

  // 5. Deliver it to that one browser. `io.to(id)` reaches exactly that socket (Socket.io puts
  //    every socket in a private room named after its own id). We write `from` ourselves from
  //    the sender's socket id. If the browser sent its own `from`, we simply never read it.
  io.to(to).emit(EVENTS.SIGNAL, { from: socket.id, data: copySignalData(data) });
}

/**
 * What is wrong with this SIGNAL payload? Returns null if nothing is wrong.
 * Example: { to: 'b7', data: { type: 'offer', sdp: 'v=0...' } } → null (fine)
 *          { data: { type: 'offer', sdp: 'v=0...' } }            → "`to` must be a player id (text)"
 *          { to: 'b7', data: { type: 'nonsense' } }              → "`data.type` must be one of offer, answer, candidate"
 *          null                                                   → "the payload must be an object"
 */
function describeSignalProblem(payload) {
  // typeof null is 'object' in JavaScript, so we check for null separately.
  if (typeof payload !== 'object' || payload === null) {
    return 'the payload must be an object';
  }
  if (typeof payload.to !== 'string' || payload.to === '') {
    return '`to` must be a player id (text)';
  }

  const data = payload.data;
  if (typeof data !== 'object' || data === null) {
    return '`data` must be an object';
  }
  if (!SIGNAL_TYPES.includes(data.type)) {
    return `\`data.type\` must be one of ${SIGNAL_TYPES.join(', ')}`;
  }

  // An offer or an answer carries its SDP (the text listing audio formats) as a string.
  if ((data.type === 'offer' || data.type === 'answer') && typeof data.sdp !== 'string') {
    return `an ${data.type} needs \`sdp\` (text)`;
  }

  // A candidate carries the browser's candidate object (from RTCIceCandidate.toJSON()).
  if (data.type === 'candidate' && (typeof data.candidate !== 'object' || data.candidate === null)) {
    return 'a candidate needs a `candidate` object';
  }

  return null;
}

/**
 * Copy only the fields the contract allows, so extra fields a browser adds are never passed on
 * (the same idea as copying only x, y and dir from a move).
 * Example: { type: 'offer', sdp: 'v=0...', junk: 1 } → { type: 'offer', sdp: 'v=0...' }
 */
function copySignalData(data) {
  if (data.type === 'candidate') {
    return { type: data.type, candidate: data.candidate };
  }
  return { type: data.type, sdp: data.sdp };
}

/**
 * Every STATE_BROADCAST_MS (100 ms), send everyone's position to everyone in the room.
 * Payload: { t, players: [{ id, x, y, dir }] }, where t is the server's clock in ms.
 * Example: { t: 1760781234567, players: [{ id: 'a1', x: 250, y: 300, dir: 'right' }] }
 */
function startStateBroadcast(io) {
  const timer = setInterval(() => {
    const players = listPlayers();

    // Nobody here: nothing to say, so don't send an empty message 10 times a second.
    if (players.length === 0) {
      return;
    }

    // Copy only the four fields the contract promises (no name, no `moved`).
    const positions = players.map((player) => ({
      id: player.id,
      x: player.x,
      y: player.y,
      dir: player.dir,
    }));

    io.to(DEFAULT_ROOM).emit(EVENTS.PLAYERS_STATE, { t: Date.now(), players: positions });
  }, STATE_BROADCAST_MS);

  // unref() tells Node: "this timer alone is not a reason to keep running".
  // The real server stays alive anyway (it is listening on a port), but a script or
  // test that loads this file can still finish and exit.
  timer.unref();
}

/**
 * A browser closed its tab or lost its connection.
 * Socket.io removes it from its rooms by itself; we remove it from our store
 * and tell everyone still in the room, so they can delete that character.
 */
function handleDisconnect(io, socket, geo) {
  const player = getPlayer(socket.id);
  const wasRemoved = removePlayer(socket.id);

  // Someone who never joined has no character on anyone's screen, so there is nobody to tell.
  if (!wasRemoved) {
    console.log(`[signaling] socket disconnected before joining: ${socket.id}`);
    return;
  }

  // Take them out of every peer set, and tell each former peer "left" (peers:update),
  // so their browsers close the voice connection.
  removeFromPeers(io, socket.id);

  // With the real engine, also delete their saved position from MongoDB, so findNearby stops
  // returning them. We don't wait for it (nothing below needs it), and a failure must never
  // crash the server, so removeUserFromGeo catches and logs it.
  if (geo) {
    removeUserFromGeo(geo, socket.id);
  }

  // The leaving socket has already left the room, so "everyone in the room" means everyone else.
  io.to(DEFAULT_ROOM).emit(EVENTS.PLAYER_LEFT, { id: socket.id });
  console.log(`[signaling] player left: ${player.name} (${socket.id}), ${listPlayers().length} left`);
}

/**
 * Ask the geo engine to forget a user who left. Any error is only logged.
 * `async` turns an error thrown straight away into a failed Promise too, so this one
 * try/catch handles both kinds.
 */
async function removeUserFromGeo(geo, playerId) {
  try {
    await geo.removeUser(playerId);
  } catch (error) {
    console.error(`[signaling] geo.removeUser failed for ${playerId} (the server keeps running):`, error);
  }
}

/**
 * The player shape used in EVENTS.WORLD_INIT and EVENTS.PLAYER_JOINED: { id, name, x, y, dir }.
 * Copying the fields keeps server-only fields (like `moved`) out of messages.
 */
function toJoinedShape(player) {
  return { id: player.id, name: player.name, x: player.x, y: player.y, dir: player.dir };
}

/** Send EVENTS.SERVER_ERROR { code, message } to one browser, and log it. */
function sendError(socket, code, message) {
  console.warn(`[signaling] error for ${socket.id}: ${code}: ${message}`);
  socket.emit(EVENTS.SERVER_ERROR, { code, message });
}
