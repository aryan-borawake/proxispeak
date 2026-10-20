// server/signaling/players.js — Person 1 (Module 1: Signaling + WebRTC)
// The in-memory list of everyone who is in the office right now.
//
// Why in memory and not in MongoDB? Positions change up to 10 times a second per person.
// Reading and writing a database that often would be far too slow, so the server keeps
// players in a JavaScript Map. MongoDB is only touched in the 250 ms proximity tick (later).
//
// The Map stores pairs:  socket id  →  { id, name, x, y, dir }
// Example entry:         'kX9a2bQ'  →  { id: 'kX9a2bQ', name: 'Riya', x: 200, y: 200, dir: 'down' }

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
