// shared/events.js
// Every Socket.io event name in ProxiSpeak lives here, once.
// An event is a named message, e.g. EVENTS.MOVE. The payload is the data inside it.
// Always write EVENTS.MOVE in code, never the text 'player:move'.
// Only Person 1 edits this file (see CONTRACTS.md, "How to request a change").

export const EVENTS = Object.freeze({
  // browser → server, once.
  // Payload: { name }   (labs and tests: joins DEFAULT_ROOM)
  //      or  { token, avatarColor?, floorId?, status? }   (v5: a signed-in employee; joins a floor room)
  JOIN: 'player:join',

  // server → that browser only, once, as the reply to JOIN.
  // Payload: { selfId, roomId, spawn: { x, y }, players: [{ id, name, x, y, dir, ...extra }] }
  // v5, token joins only, extra fields: profile (who I am, my desk) and office (the floor snapshot).
  WORLD_INIT: 'world:init',

  // server → everyone else in the room, when someone joins.
  // Payload: { id, name, x, y, dir }   (v5 adds: status, avatarColor, role, department)
  PLAYER_JOINED: 'player:joined',

  // browser → server, at most MOVE_SEND_HZ (10) times a second, only when the player moved.
  // Payload: { x, y, dir }
  MOVE: 'player:move',

  // server → everyone in the room, every STATE_BROADCAST_MS (100 ms).
  // Payload: { t, players: [{ id, x, y, dir }] }   (t = server time in ms)
  PLAYERS_STATE: 'players:state',

  // server → everyone in the room, when someone disconnects.
  // Payload: { id }
  PLAYER_LEFT: 'player:left',

  // server → one browser, when its nearby people change (checked every PROXIMITY_TICK_MS, 250 ms).
  // Payload: { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }
  // In Weeks 1–2, mode is always 'falloff' and changed is always empty.
  PEERS_UPDATE: 'peers:update',

  // browser → server → browser, during WebRTC handshakes.
  // Sent by a browser:      { to, data }
  // Delivered by the server: { from, data }   (the server sets from itself)
  // data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }
  SIGNAL: 'rtc:signal',

  // server → one browser, when that browser sent bad input.
  // Payload: { code, message }
  SERVER_ERROR: 'server:error',

  // ---- v5: the Infotact office ----

  // browser → server: "my status is now ...".   Payload: { status }   (one of STATUSES)
  // server → everyone in the room:              Payload: { id, status }
  PLAYER_STATUS: 'player:status',

  // server → everyone on one floor, when the floor changed: a wing opened, a department was
  // added or resized, desks were reassigned.
  // Payload: { floorId, tier, openWings: ['A', ...], departments: [{ id, name, color, deskIds }], hotDeskIds }
  OFFICE_UPDATE: 'office:update',

  // browser → server: "take me to this floor" (elevator or Floors button).   Payload: { floorId }
  FLOOR_CHANGE: 'floor:change',

  // server → one browser: "you are now on this floor". Sent after FLOOR_CHANGE, and also when the
  // admin moves your department to another floor. Same payload as WORLD_INIT (a new world).
  FLOOR_CHANGED: 'floor:changed',
});
