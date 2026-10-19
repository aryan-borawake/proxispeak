// server/geo/index.js — Person 2 (Module 2: Geospatial engine)
// The list of functions other modules may use. Answers "who is near whom?" with MongoDB.
// Exact names and shapes: CONTRACTS.md. Plan: docs/briefs/module-2-geospatial.md.
//
// SKELETON STUB: every function warns once and returns a safe empty value,
// so Person 1's server still boots before this module is built.

const BRIEF = 'docs/briefs/module-2-geospatial.md';
const warned = new Set();

// Print a "not built yet" warning only the first time each function is called,
// so the 250 ms tick doesn't flood the console.
function warnOnce(name, task) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`[geo] ${name}() not built yet — see ${BRIEF}, Task ${task}`);
}

/**
 * Connect to MongoDB.
 * @param {string} uri - the connection string, read from .env (MONGODB_URI) by the caller
 * @returns {Promise<void>}
 */
export async function connectDb(uri) {
  warnOnce('connectDb', 1);
}

/**
 * Create the geo engine for one room.
 * @param {{ roomId: string }} options - e.g. { roomId: DEFAULT_ROOM }
 * @returns {{
 *   upsertPositions: (users: Array<{ id: string, x: number, y: number }>) => Promise<void>,
 *   findNearby: (userId: string, maxDistancePx: number) => Promise<Array<{ id: string, distance: number }>>,
 *   removeUser: (userId: string) => Promise<void>,
 * }}
 */
export function createGeoEngine({ roomId }) {
  warnOnce('createGeoEngine', 8);

  return {
    /**
     * Save everyone who moved, in ONE bulkWrite with upserts.
     * @param {Array<{ id: string, x: number, y: number }>} users
     * @returns {Promise<void>}
     */
    async upsertPositions(users) {
      warnOnce('upsertPositions', 6);
    },

    /**
     * Find people in the same room within maxDistancePx of userId.
     * Closest first. Never includes userId itself.
     * @param {string} userId
     * @param {number} maxDistancePx - normally DISCONNECT_PX
     * @returns {Promise<Array<{ id: string, distance: number }>>}
     */
    async findNearby(userId, maxDistancePx) {
      warnOnce('findNearby', 4);
      return [];
    },

    /**
     * Delete a user's saved position (they left).
     * @param {string} userId
     * @returns {Promise<void>}
     */
    async removeUser(userId) {
      warnOnce('removeUser', 6);
    },
  };
}

/**
 * The "came close / walked away" rule. Pure function: no database, no network.
 * - Not connected and distance <= connectPx  → entered.
 * - Connected and distance > disconnectPx (or missing from nearby) → left.
 * - Anything in between keeps its current state.
 * Example: current {u2, u3}; nearby [{ id: 'u2', distance: 120 }, { id: 'u4', distance: 80 }]
 *          → { entered: ['u4'], left: ['u3'] }
 *
 * @param {Set<string>} currentPeerIds - who this user is connected to now
 * @param {Array<{ id: string, distance: number }>} nearby - from findNearby(id, DISCONNECT_PX)
 * @param {{ connectPx: number, disconnectPx: number }} options - EARSHOT_PX and DISCONNECT_PX
 * @returns {{ entered: string[], left: string[] }}
 */
export function computePeerChanges(currentPeerIds, nearby, { connectPx, disconnectPx }) {
  warnOnce('computePeerChanges', 7);
  return { entered: [], left: [] };
}

// PLANNED Week 3: usersInZone(zone) via $geoWithin; canHear(a, b) → { audible, mode }
