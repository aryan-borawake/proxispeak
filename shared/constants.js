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
});

// How a voice's volume is set.
export const AUDIO_MODES = Object.freeze({
  FALLOFF: 'falloff', // quieter with distance, silent at EARSHOT_PX
  FULL: 'full', // full volume whatever the distance (same private room, stage)
});
