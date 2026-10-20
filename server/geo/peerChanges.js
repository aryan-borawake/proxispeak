// server/geo/peerChanges.js — Person 2 (Module 2: Geospatial engine)
// Pure function for connection/disconnection hysteresis logic.
// See CONTRACTS.md (Section 6) and docs/briefs/module-2-geospatial.md (Task 7).

import { EARSHOT_PX, DISCONNECT_PX } from '../../shared/constants.js';

/**
 * Computes which peers entered or left proximity based on hysteresis thresholds.
 *
 * Rules:
 * - A disconnected user at distance <= connectPx  → entered
 * - A connected user at distance > disconnectPx or missing from nearby → left
 * - Anything in between (connectPx < distance <= disconnectPx) maintains current state
 * - Pure function: no database, no network, no side-effects.
 *
 * @param {Set<string>|Array<string>} currentPeerIds - peers currently connected
 * @param {Array<{ id: string, distance: number }>} nearby - nearby peers with distances
 * @param {object} [options]
 * @param {number} [options.connectPx=EARSHOT_PX] - distance threshold to start connection (default 100)
 * @param {number} [options.disconnectPx=DISCONNECT_PX] - distance threshold to end connection (default 140)
 * @returns {{ entered: string[], left: string[] }}
 */
export function computePeerChanges(
  currentPeerIds,
  nearby = [],
  { connectPx = EARSHOT_PX, disconnectPx = DISCONNECT_PX } = {}
) {
  const currentSet = currentPeerIds instanceof Set ? currentPeerIds : new Set(currentPeerIds || []);
  const nearbyMap = new Map();

  for (const item of nearby) {
    if (item && item.id != null) {
      nearbyMap.set(String(item.id), Number(item.distance));
    }
  }

  const entered = [];
  const left = [];

  // Check newly entered peers (not connected yet and within connectPx)
  for (const [id, distance] of nearbyMap.entries()) {
    if (!currentSet.has(id)) {
      if (distance <= connectPx) {
        entered.push(id);
      }
    }
  }

  // Check leaving peers (currently connected but beyond disconnectPx or disappeared from nearby)
  for (const id of currentSet) {
    const distance = nearbyMap.get(id);
    if (distance === undefined || distance > disconnectPx) {
      left.push(id);
    }
  }

  return { entered, left };
}
