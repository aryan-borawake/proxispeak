// server/signaling/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The server half of Module 1: the player list, join/move/leave, the 100 ms position
// broadcast, the 250 ms proximity tick and the WebRTC note passing.
// Exact names and payloads: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// Built so far: join and disconnect (Task 2); MOVE, the PLAYERS_STATE broadcast and
// PLAYER_LEFT (Task 3); the proximity tick (Task 6, tick.js); SIGNAL note passing between
// peers in earshot (Task 8); Person 2's geo engine, with fakeNearby.js as the fallback (Task 9);
// the geo self-check at start-up (geoSelfCheck.js) and disconnect reasons in the log (Task 11).
// v5 (the Infotact office, officeRooms.js): joining with a sign-in token, one room per floor,
// EVENTS.PLAYER_STATUS (Do Not Disturb leaves you out of every peer set), EVENTS.FLOOR_CHANGE
// (the elevator), EVENTS.OFFICE_UPDATE, and refusing moves into closed wings.

import { EVENTS } from '../../shared/events.js';
import {
  DEFAULT_ROOM,
  DEFAULT_SPAWN,
  DIRECTIONS,
  ERROR_CODES,
  STATE_BROADCAST_MS,
  STATUSES,
  WORLD_MAX_PX,
} from '../../shared/constants.js';
import { getFloor } from '../office/store.js';
import { addPlayer, removePlayer, getPlayer, listPlayers, updatePlayerPosition } from './players.js';
import { startProximityTick, removeFromPeers, arePeers, disconnectAllPeers } from './tick.js';
import {
  buildWorldInit,
  getOnlineEmployeeIds,
  isMoveIntoClosedWing,
  movePlayerToFloor,
  readTokenJoin,
  toJoinedShape,
  watchOfficeChanges,
} from './officeRooms.js';

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
 * @param {{ geo: object | null, createGeoEngine?: Function }} options - geo is Person 2's engine
 *   from createGeoEngine() for DEFAULT_ROOM, or null when it isn't available (then the tick uses
 *   the fake, fakeNearby.js). v5: createGeoEngine makes one more engine per floor room.
 * @returns {{ getOnlineEmployeeIds: () => Set<string> }} for the admin page's "online" column
 */
export function attachSignaling(io, { geo, createGeoEngine = null }) {
  const geoFor = makeGeoDirectory(geo, createGeoEngine);

  // This runs once for every browser that connects.
  io.on('connection', (socket) => {
    console.log(`[signaling] socket connected: ${socket.id}`);

    socket.on(EVENTS.JOIN, (payload) => {
      handleJoin(socket, payload);
    });

    socket.on(EVENTS.MOVE, (payload) => {
      handleMove(socket, payload);
    });

    socket.on(EVENTS.PLAYER_STATUS, (payload) => {
      handleStatus(io, socket, payload);
    });

    socket.on(EVENTS.FLOOR_CHANGE, (payload) => {
      handleFloorChange(io, socket, payload, geoFor);
    });

    socket.on(EVENTS.SIGNAL, (payload) => {
      handleSignal(io, socket, payload);
    });

    // `reason` is Socket.io's explanation, e.g. 'transport close' (tab closed, wifi lost,
    // page refreshed) or 'client namespace disconnect' (the page called socket.disconnect()).
    socket.on('disconnect', (reason) => {
      handleDisconnect(io, socket, geoFor, reason);
    });
  });

  // One timer for the whole server (not one per player), started once, here.
  startStateBroadcast(io);

  // The "who is near whom?" check, every PROXIMITY_TICK_MS (250 ms). Also one timer, started once.
  // geoFor goes to the tick: it gives Person 2's engine for a room if we have one, otherwise null (the fake).
  startProximityTick(io, geoFor);

  // When the admin changes the office: tell the floors, move people between floors.
  watchOfficeChanges(io, geoFor);

  console.log('[signaling] ready: listening for joins, moves and signals');
  return { getOnlineEmployeeIds };
}

/**
 * v5: one geo engine per room. Person 2's createGeoEngine({ roomId }) already keeps rooms apart
 * (findNearby only returns people of its own room), so each floor gets its own engine, made the
 * first time someone is on that floor. DEFAULT_ROOM keeps the engine server/index.js made.
 * Without MongoDB (geo is null) every room uses the fake: geoFor returns null.
 *
 * @returns {(roomId: string) => object | null}
 */
function makeGeoDirectory(geo, createGeoEngine) {
  const engines = new Map();
  return (roomId) => {
    if (!geo) return null;
    if (roomId === DEFAULT_ROOM || !createGeoEngine) return geo;
    if (!engines.has(roomId)) engines.set(roomId, createGeoEngine({ roomId }));
    return engines.get(roomId);
  };
}

/**
 * A browser sent EVENTS.JOIN.
 *   { name }   labs and robot tests: join DEFAULT_ROOM at DEFAULT_SPAWN with that name.
 *   { token, avatarColor?, floorId?, status? }   v5, a signed-in employee: the server checks the
 *              token, takes the name from the directory, and joins the room of their floor.
 * Check it, add the player, put them in the room, and tell everyone in that room.
 */
function handleJoin(socket, payload) {
  // 1. Don't let the same tab join twice.
  if (getPlayer(socket.id)) {
    sendError(socket, ERROR_CODES.ALREADY_JOINED, 'You have already joined. Refresh the page to join again.');
    return;
  }

  // 2. Validate: never trust data from a browser. The payload might be missing,
  //    or name might be a number, an empty string, or just spaces.
  let fields;
  let roomId;
  let spawn;
  const hasToken = typeof payload === 'object' && payload !== null && 'token' in payload;
  if (hasToken) {
    const tokenJoin = readTokenJoin(payload);
    if (!tokenJoin.ok) {
      sendError(socket, ERROR_CODES.BAD_TOKEN, tokenJoin.message);
      return;
    }
    ({ fields, roomId, spawn } = tokenJoin);
  } else {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    if (name === '') {
      sendError(socket, ERROR_CODES.BAD_NAME, 'Join needs a name: send { name: "Riya" } with a non-empty string.');
      return;
    }
    roomId = DEFAULT_ROOM;
    spawn = { x: DEFAULT_SPAWN.x, y: DEFAULT_SPAWN.y };
    fields = { name, x: spawn.x, y: spawn.y, dir: SPAWN_DIR, roomId, status: STATUSES.AVAILABLE };
  }

  // 3. Add the player at the spawn point. (buildWorldInit lists the others in the room, without me,
  //    and copies only the contract's fields, so server-only fields like `moved` never leave the server.)
  const player = addPlayer({ id: socket.id, ...fields });

  // 4. Put this socket in its room (a floor, or DEFAULT_ROOM), so room-wide messages reach it.
  socket.join(roomId);

  // 5. Reply to the new player only: who you are, where you start, who is here.
  socket.emit(EVENTS.WORLD_INIT, buildWorldInit(player, spawn));

  // 6. Tell everyone else in the room. `socket.to(room)` means "the room, except me".
  socket.to(roomId).emit(EVENTS.PLAYER_JOINED, toJoinedShape(player));

  console.log(`[signaling] player joined: ${player.name} (${socket.id}) in ${roomId}, ${listPlayers().length} online`);
}

/**
 * v5: a browser sent EVENTS.PLAYER_STATUS { status }. Store it and tell the room { id, status }.
 * Do Not Disturb: hang up every voice connection now; the tick then keeps the player out of every
 * peer set (tick.js, askWhoIsNear). Back to available/busy: `moved = true`, so the next tick
 * connects them to whoever is near.
 */
function handleStatus(io, socket, payload) {
  const player = getPlayer(socket.id);
  if (!player) {
    sendError(socket, ERROR_CODES.NOT_JOINED, 'Join first: send EVENTS.JOIN before changing your status.');
    return;
  }
  const status = payload?.status;
  if (!Object.values(STATUSES).includes(status)) {
    sendError(socket, ERROR_CODES.BAD_STATUS, `Status ignored: send { status } with one of ${Object.values(STATUSES).join(', ')}.`);
    return;
  }
  player.status = status;
  if (status === STATUSES.DND) {
    disconnectAllPeers(io, player.id);
  } else {
    player.moved = true;
  }
  io.to(player.roomId).emit(EVENTS.PLAYER_STATUS, { id: player.id, status });
  console.log(`[signaling] ${player.name} (${player.id}) is now ${status}`);
}

/**
 * v5: a browser sent EVENTS.FLOOR_CHANGE { floorId } (the elevator or the Floors button).
 * Only signed-in employees have floors; labs and tests (DEFAULT_ROOM) get BAD_FLOOR.
 */
function handleFloorChange(io, socket, payload, geoFor) {
  const player = getPlayer(socket.id);
  if (!player) {
    sendError(socket, ERROR_CODES.NOT_JOINED, 'Join first: send EVENTS.JOIN before changing floor.');
    return;
  }
  const floorId = payload?.floorId;
  if (!player.employeeId || typeof floorId !== 'string' || !getFloor(floorId)) {
    sendError(socket, ERROR_CODES.BAD_FLOOR, `Floor change ignored: "${floorId}" is not a floor (or you joined without signing in).`);
    return;
  }
  movePlayerToFloor(io, socket, floorId, geoFor);
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

  // 3. v5: a wing that is not open yet can't be entered. The browser blocks it too (its collision
  //    check), but we never trust the browser. Example: tier 1, a move into wing B → WING_CLOSED.
  if (isMoveIntoClosedWing(getPlayer(socket.id), payload.x, payload.y)) {
    sendError(socket, ERROR_CODES.WING_CLOSED, 'Move ignored: that wing is not open yet. It opens when the floor grows to its tier.');
    return;
  }

  // 4. Store only x, y and dir (players.js copies them one by one).
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

    // v5: one message per room, holding only that room's players, so a floor never sees another
    // floor's people. Copy only the four fields the contract promises (no name, no `moved`).
    const positionsByRoom = new Map();
    for (const player of players) {
      const list = positionsByRoom.get(player.roomId) || [];
      list.push({ id: player.id, x: player.x, y: player.y, dir: player.dir });
      positionsByRoom.set(player.roomId, list);
    }

    const t = Date.now();
    for (const [roomId, positions] of positionsByRoom) {
      io.to(roomId).emit(EVENTS.PLAYERS_STATE, { t, players: positions });
    }
  }, STATE_BROADCAST_MS);

  // unref() tells Node: "this timer alone is not a reason to keep running".
  // The real server stays alive anyway (it is listening on a port), but a script or
  // test that loads this file can still finish and exit.
  timer.unref();
}

/**
 * A browser closed its tab, refreshed the page, or lost its connection.
 * Socket.io removes it from its rooms by itself; we remove it from our store
 * and tell everyone still in the room, so they can delete that character.
 *
 * A refreshed tab is simply a new connection: it gets a new socket id and joins again as a
 * new player. A browser that reconnects after a network blip also gets a new id; its net
 * module sends EVENTS.JOIN again by itself (client/src/net, Task 11).
 *
 * Example log: "[signaling] disconnect a1 (Riya): transport close"
 */
function handleDisconnect(io, socket, geoFor, reason) {
  const player = getPlayer(socket.id);
  const wasRemoved = removePlayer(socket.id);

  // Someone who never joined has no character on anyone's screen, so there is nobody to tell.
  if (!wasRemoved) {
    console.log(`[signaling] disconnect ${socket.id} (never joined): ${reason}`);
    return;
  }
  console.log(`[signaling] disconnect ${socket.id} (${player.name}): ${reason}`);

  // Take them out of every peer set, and tell each former peer "left" (peers:update),
  // so their browsers close the voice connection.
  removeFromPeers(io, socket.id);

  // With the real engine, also delete their saved position from MongoDB, so findNearby stops
  // returning them. We don't wait for it (nothing below needs it), and a failure must never
  // crash the server, so removeUserFromGeo catches and logs it.
  const geo = geoFor(player.roomId);
  if (geo) {
    removeUserFromGeo(geo, socket.id);
  }

  // The leaving socket has already left the room, so "everyone in the room" means everyone else.
  io.to(player.roomId).emit(EVENTS.PLAYER_LEFT, { id: socket.id });
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

/** Send EVENTS.SERVER_ERROR { code, message } to one browser, and log it. */
function sendError(socket, code, message) {
  console.warn(`[signaling] error for ${socket.id}: ${code}: ${message}`);
  socket.emit(EVENTS.SERVER_ERROR, { code, message });
}
