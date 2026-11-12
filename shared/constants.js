// shared/constants.js
// Every shared number and fixed list in ProxiSpeak lives here, once.
// Server and client both import from this file. Never type these numbers anywhere else.
// Only Person 1 edits this file (see CONTRACTS.md, "How to request a change").
// All distances are in pixels (px). All times are in milliseconds (ms).

// Two people start a voice connection when they are this close.
// It is also the distance where a voice's volume reaches 0.
export const EARSHOT_PX = 100;

// An existing voice connection is closed only when the two people are farther apart than this.
// The gap between 100 and 140 stops connections flickering on and off at the edge.
export const DISCONNECT_PX = 140;

// The most voice connections one person may have at once (their nearest 8). Used from Week 3.
export const MAX_PEERS = 8;

// The browser sends its own position to the server at most this many times a second.
export const MOVE_SEND_HZ = 10;

// The server sends everyone's positions to every browser this often (100 ms = 10 times a second).
export const STATE_BROADCAST_MS = 100;

// The server checks "who is near whom?" this often (250 ms = 4 times a second).
export const PROXIMITY_TICK_MS = 250;

// The width and height of one map tile.
export const TILE_SIZE = 32;

// The largest x or y a position can have. Also the upper bound of the MongoDB 2d index.
export const WORLD_MAX_PX = 4096;

// The name of the one office room everybody joins for now.
export const DEFAULT_ROOM = 'office-1';

// Where a new person appears. A placeholder until the map's lobby is final.
export const DEFAULT_SPAWN = Object.freeze({ x: 200, y: 200 });

// The four directions an avatar can face.
export const DIRECTIONS = Object.freeze(['up', 'down', 'left', 'right']);

// The kinds of zone the office map can contain (used from Week 3).
export const ZONE_TYPES = Object.freeze({
  OPEN: 'open', // normal floor: you hear people near you
  PRIVATE: 'private', // meeting room: only people inside hear each other, at full volume
  SILENT: 'silent', // focus room: nobody hears anybody
  STAGE: 'stage', // the speaker on stage is heard by everyone in the stage hall
  LOBBY: 'lobby', // the entrance: works like open floor
});

// The `code` inside every EVENTS.SERVER_ERROR message is one of these.
// A code lets the browser tell errors apart without reading the message text.
export const ERROR_CODES = Object.freeze({
  BAD_NAME: 'BAD_NAME', // join had a missing or empty name
  ALREADY_JOINED: 'ALREADY_JOINED', // this browser tab already joined
  NOT_JOINED: 'NOT_JOINED', // the browser sent something (e.g. a move) before joining
  BAD_MOVE: 'BAD_MOVE', // a move had a bad x, y or dir, so it was ignored
  BAD_SIGNAL: 'BAD_SIGNAL', // a WebRTC note had a bad shape, or its receiver is not online or not in earshot
  BAD_TOKEN: 'BAD_TOKEN', // v5: a join token was missing, forged, expired, or its employee no longer exists
  BAD_STATUS: 'BAD_STATUS', // v5: a status that is not one of STATUSES
  BAD_FLOOR: 'BAD_FLOOR', // v5: a floor change to a floor that does not exist, or from a lab join
  WING_CLOSED: 'WING_CLOSED', // v5: a move into a wing that is not open yet (the floor's tier is too small)
});

// ---- v5: the Infotact office ----

// What a person shows next to their name. DND = Do Not Disturb: nobody hears them and they hear nobody.
export const STATUSES = Object.freeze({
  AVAILABLE: 'available',
  BUSY: 'busy',
  DND: 'dnd',
});

// Job roles in the employee directory. Only 'admin' may use the admin page.
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  DIRECTOR: 'director',
  LEAD: 'lead',
  EMPLOYEE: 'employee',
  INTERN: 'intern',
});

// The four desk wings of one floor, in the order they open.
export const WING_IDS = Object.freeze(['A', 'B', 'C', 'D']);

// Every wing has this many desks. A floor's capacity is WING_IDS.length × DESKS_PER_WING = 100.
export const DESKS_PER_WING = 25;

// The most people one floor holds at its desks. Beyond this, new hires get a hot desk.
export const FLOOR_CAPACITY = 100;

// The floor everybody is on until the admin adds another one. Its id is also its room id.
export const DEFAULT_FLOOR_ID = 'floor-1';

// How long a sign-in token works: 12 hours, in ms.
export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

// The six avatar colours a person can pick in the lobby.
export const AVATAR_COLORS = Object.freeze(['#2f80ed', '#eb5757', '#27ae60', '#f2994a', '#9b51e0', '#00a3a3']);

// The kinds of alert the admin page shows.
export const ALERT_TYPES = Object.freeze({
  FLOOR_FULL: 'floor-full', // a new hire got a hot desk because no desk was free
  WING_OPENED: 'wing-opened', // a floor's tier grew and a wing opened
  FLOOR_ADDED: 'floor-added', // a new floor was added
});

// How a voice's volume is set.
export const AUDIO_MODES = Object.freeze({
  FALLOFF: 'falloff', // quieter with distance, silent at EARSHOT_PX
  FULL: 'full', // full volume whatever the distance (same private room, stage)
});
