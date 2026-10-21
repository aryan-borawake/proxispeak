// server/signaling/players.js — Person 1 (Module 1: Signaling + WebRTC)
// The in-memory list of everyone who is in the office right now.
//
// Why in memory and not in MongoDB? Positions change up to 10 times a second per person.
// Reading and writing a database that often would be far too slow, so the server keeps
// players in a JavaScript Map. MongoDB is only touched in the 250 ms proximity tick (later).
//
// The Map stores pairs:  socket id  →  { id, name, x, y, dir }
// Example entry:         'kX9a2bQ'  →  { id: 'kX9a2bQ', name: 'Riya', x: 200, y: 200, dir: 'down' }
// After their first move a player also has `moved: true` (see updatePlayerPosition below).

const players = new Map();

/**
 * Add a new player to the store.
 * @param {{ id: string, name: string, x: number, y: number, dir: string }} player
 * @returns {object} the player that was stored
 */
export function addPlayer({ id, name, x, y, dir }) {
  const player = { id, name, x, y, dir };
  players.set(id, player);
  return player;
}

/**
 * Store a player's new position after a valid EVENTS.MOVE.
 * The caller (the move handler) must validate x, y and dir first.
 *
 * We copy only x, y and dir, one by one. Even if the browser sent extra fields
 * (e.g. { x, y, dir, name: 'Hacker' }), they never reach the store.
 *
 * `moved = true` marks "this player moved since the last proximity tick".
 * The proximity tick (Task 6) will read it and set it back to false.
 *
 * @param {string} id - the player's socket id
 * @param {{ x: number, y: number, dir: string }} position - already validated
 * @returns {object | undefined} the updated player, or undefined if nobody has that id
 */
export function updatePlayerPosition(id, { x, y, dir }) {
  const player = players.get(id);
  if (!player) {
    return undefined;
  }

  player.x = x;
  player.y = y;
  player.dir = dir;
  player.moved = true;
  return player;
}

/**
 * Remove a player from the store.
 * @param {string} id - the player's socket id
 * @returns {boolean} true if the player was there and got removed, false if they were never there
 */
export function removePlayer(id) {
  return players.delete(id);
}

/**
 * Look up one player.
 * @param {string} id - the player's socket id
 * @returns {object | undefined} the player, or undefined if nobody has that id
 */
export function getPlayer(id) {
  return players.get(id);
}

/**
 * Get every player as an array (a Map can't be sent over Socket.io, but an array can).
 * @returns {object[]} e.g. [{ id: 'a1', name: 'Riya', x: 200, y: 200, dir: 'down' }]
 */
export function listPlayers() {
  return Array.from(players.values());
}
