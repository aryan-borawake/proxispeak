// server/signaling/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The server half of Module 1: the player list, join/move/leave, the 100 ms position
// broadcast, the 250 ms proximity tick and the WebRTC note passing.
// Exact names and payloads: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// SKELETON STUB: nothing here works yet. It only logs a warning so the server still boots.

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
  console.warn('[signaling] not built yet — see docs/briefs/module-1-signaling-webrtc.md, Task 2');
}
