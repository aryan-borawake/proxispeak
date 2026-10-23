// server/signaling/fakeNearby.js — Person 1 (Module 1: Signaling + WebRTC)
// A FAKE "who is near" check, so the proximity tick works before Person 2's geo engine exists.
//
// Why a fake? The real answer will come from MongoDB (Person 2's server/geo/). Until it is
// plugged in (Task 9), we measure distances ourselves from the in-memory players Map.
// Both functions answer in exactly the same format as CONTRACTS.md section 6, so swapping
// to the real engine later only changes which functions tick.js calls.

import { getPlayer, listPlayers } from './players.js';

/**
 * Who is within `maxDistancePx` of this user? Same answer format as geo.findNearby.
 *
 * - Distance is the straight line between the two points: Math.hypot(dx, dy).
 * - The user is never in their own answer.
 * - Closest first.
 * - "Within" includes the edge: a player exactly maxDistancePx away is included (<=).
 * - There is only one room for now (DEFAULT_ROOM), and every player is in it,
 *   so we don't need to filter by room.
 *
 * It is `async` (returns a Promise) only so it looks exactly like the real engine,
 * which has to wait for MongoDB.
 *
 * Example: me at (200, 200), Sam at (290, 200), Lee at (200, 600), maxDistancePx 140
 *   Sam: Math.hypot(90, 0)  = 90  → 90 <= 140, included
 *   Lee: Math.hypot(0, 400) = 400 → too far, left out
 *   → [{ id: 'sam', distance: 90 }]
 *
 * @param {string} userId - the player we measure from
 * @param {number} maxDistancePx - normally DISCONNECT_PX
 * @returns {Promise<Array<{ id: string, distance: number }>>}
 */
export async function findNearby(userId, maxDistancePx) {
  const me = getPlayer(userId);

  // The player may have left a moment ago. Nobody is near someone who isn't here.
  if (!me) {
    return [];
  }

  const nearby = [];
  for (const other of listPlayers()) {
    // Never include the user themselves.
    if (other.id === userId) {
      continue;
    }

    const distance = Math.hypot(other.x - me.x, other.y - me.y);
    if (distance <= maxDistancePx) {
      nearby.push({ id: other.id, distance });
    }
  }

  // Closest first: a negative result puts `first` before `second`.
  nearby.sort((first, second) => first.distance - second.distance);
  return nearby;
}

/**
 * temporary: replaced by Person 2's engine in Task 9.
 * (server/geo/index.js still has a stub that always answers "no changes".)
 *
 * The "came close / walked away" rule. A pure function: it only looks at its inputs
 * (no database, no network, no players Map), so the same inputs always give the same answer.
 *
 * - NOT connected and distance <= connectPx            → entered
 * - connected and distance > disconnectPx              → left
 * - connected and missing from `nearby` (too far away) → left
 * - anything else stays as it is
 *
 * Why two distances? With one line at 100 px, someone standing at 99–101 px would connect,
 * disconnect, connect... every tick (flicker). With 100 to connect and 140 to disconnect,
 * small wobbles at the edge change nothing.
 *
 * Example (CONTRACTS.md worked example):
 *   currentPeerIds {u2, u3}; nearby [{ id: 'u2', distance: 120 }, { id: 'u4', distance: 80 }]
 *   u4: not connected, 80 <= 100           → entered
 *   u2: connected, 120 <= 140              → stays
 *   u3: connected, missing from nearby     → left
 *   → { entered: ['u4'], left: ['u3'] }
 *
 * @param {Set<string>} currentPeerIds - who this user is connected to now
 * @param {Array<{ id: string, distance: number }>} nearby - from findNearby(id, DISCONNECT_PX)
 * @param {{ connectPx: number, disconnectPx: number }} options - EARSHOT_PX and DISCONNECT_PX
 * @returns {{ entered: string[], left: string[] }}
 */
export function computePeerChanges(currentPeerIds, nearby, { connectPx, disconnectPx }) {
  const entered = [];
  const left = [];

  // Remember every id in `nearby`, so afterwards we can spot connected peers that are missing.
  const nearbyIds = new Set();

  for (const { id, distance } of nearby) {
    nearbyIds.add(id);
    const isConnected = currentPeerIds.has(id);

    if (!isConnected && distance <= connectPx) {
      entered.push(id);
    } else if (isConnected && distance > disconnectPx) {
      left.push(id);
    }
    // Otherwise: nothing changes for this person.
  }

  // Connected peers that findNearby didn't return are farther away than we searched, so they left.
  for (const peerId of currentPeerIds) {
    if (!nearbyIds.has(peerId)) {
      left.push(peerId);
    }
  }

  return { entered, left };
}
