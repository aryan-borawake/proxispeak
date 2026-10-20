// server/signaling/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The server half of Module 1: the player list, join/move/leave, the 100 ms position
// broadcast, the 250 ms proximity tick and the WebRTC note passing.
// Exact names and payloads: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// Built so far (Task 2): join and disconnect.
// Still to come: MOVE + PLAYERS_STATE + PLAYER_LEFT (Task 3), proximity tick (Task 6),
// SIGNAL note passing (Task 8).

import { EVENTS } from '../../shared/events.js';
import { DEFAULT_ROOM, DEFAULT_SPAWN } from '../../shared/constants.js';
import { addPlayer, removePlayer, getPlayer, listPlayers } from './players.js';

// New players face down (towards the screen) when they appear. One of DIRECTIONS.
const SPAWN_DIR = 'down';

// Codes sent inside EVENTS.SERVER_ERROR, so the browser can tell errors apart.
const ERROR_CODES = Object.freeze({
  BAD_NAME: 'BAD_NAME',
  ALREADY_JOINED: 'ALREADY_JOINED',
});

/**
 * Plug all Socket.io event handlers into the server.
 * Handles EVENTS.JOIN, EVENTS.MOVE, EVENTS.SIGNAL and disconnects, and sends
 * EVENTS.WORLD_INIT, EVENTS.PLAYER_JOINED, EVENTS.PLAYERS_STATE (every STATE_BROADCAST_MS),
 * EVENTS.PLAYER_LEFT, EVENTS.PEERS_UPDATE (tick every PROXIMITY_TICK_MS) and EVENTS.SERVER_ERROR.
 *
 * @param {import('socket.io').Server} io - the Socket.io server
 * @param {{ geo: object | null }} options - geo is Person 2's engine from createGeoEngine(),
 *   or null until Task 9 (until then a fake "who is near" check is used)
 * @returns {void}
 */
export function attachSignaling(io, { geo }) {
  // `geo` is not used yet. It is plugged in at Task 9.

  // This runs once for every browser that connects.
  io.on('connection', (socket) => {
    console.log(`[signaling] socket connected: ${socket.id}`);

    socket.on(EVENTS.JOIN, (payload) => {
      handleJoin(socket, payload);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket);
    });
  });

  console.log('[signaling] ready: listening for joins');
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
  const playersAlreadyHere = listPlayers();

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
  socket.to(DEFAULT_ROOM).emit(EVENTS.PLAYER_JOINED, player);

  console.log(`[signaling] player joined: ${name} (${socket.id}), ${listPlayers().length} in ${DEFAULT_ROOM}`);
}

/**
 * A browser closed its tab or lost its connection.
 * Socket.io removes it from its rooms by itself; we remove it from our store.
 * (Telling the others with EVENTS.PLAYER_LEFT is Task 3.)
 */
function handleDisconnect(socket) {
  const player = getPlayer(socket.id);
  const wasRemoved = removePlayer(socket.id);

  if (wasRemoved) {
    console.log(`[signaling] player removed: ${player.name} (${socket.id}), ${listPlayers().length} left`);
  } else {
    console.log(`[signaling] socket disconnected before joining: ${socket.id}`);
  }
}

/** Send EVENTS.SERVER_ERROR { code, message } to one browser, and log it. */
function sendError(socket, code, message) {
  console.warn(`[signaling] error for ${socket.id}: ${code}: ${message}`);
  socket.emit(EVENTS.SERVER_ERROR, { code, message });
}
