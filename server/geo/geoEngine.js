// server/geo/geoEngine.js — Person 2 (Module 2: Geospatial engine)
// Implements createGeoEngine({ roomId }):
//   - upsertPositions(users): batch position writes in one bulkWrite trip
//   - findNearby(userId, maxDistancePx): $near geospatial search in room excluding self
//   - removeUser(userId): position removal when a user leaves
// Exact contracts: CONTRACTS.md (Section 6) and docs/briefs/module-2-geospatial.md.

import { Position } from './models/Position.js';
import { DEFAULT_ROOM } from '../../shared/constants.js';

/**
 * Creates a geospatial engine instance for a specific room.
 *
 * @param {object} options
 * @param {string} [options.roomId=DEFAULT_ROOM] - Room identifier (e.g. 'office-1')
 * @returns {{
 *   roomId: string,
 *   upsertPositions: (users: Array<{ id: string, x: number, y: number }>) => Promise<void>,
 *   findNearby: (userId: string, maxDistancePx: number) => Promise<Array<{ id: string, distance: number }>>,
 *   removeUser: (userId: string) => Promise<void>,
 * }}
 */
export function createGeoEngine({ roomId = DEFAULT_ROOM } = {}) {
  if (!roomId || typeof roomId !== 'string') {
    throw new Error('[geo] createGeoEngine: roomId must be a non-empty string');
  }

  // In-memory cache of current positions in this room to avoid redundant findOne roundtrips
  const positionCache = new Map();

  return {
    roomId,

    /**
     * Saves everyone who moved using ONE bulkWrite with upserts.
     * Keeps database trips to 1 per proximity tick (4 times/sec).
     *
     * @param {Array<{ id: string, x: number, y: number }>} users
     * @returns {Promise<void>}
     */
    async upsertPositions(users) {
      if (!Array.isArray(users) || users.length === 0) {
        return;
      }

      // Filter and validate valid coordinates
      const validOps = [];
      const now = new Date();

      for (const u of users) {
        if (!u || u.id == null || typeof u.x !== 'number' || typeof u.y !== 'number') {
          continue;
        }

        const idStr = String(u.id);
        positionCache.set(idStr, [u.x, u.y]);

        validOps.push({
          updateOne: {
            filter: { _id: idStr },
            update: {
              $set: {
                roomId,
                loc: [u.x, u.y],
                updatedAt: now,
              },
            },
            upsert: true,
          },
        });
      }

      if (validOps.length === 0) {
        return;
      }

      try {
        await Position.bulkWrite(validOps, { ordered: false });
      } catch (err) {
        console.error(`[geo] upsertPositions error in room ${roomId}:`, err.message);
        throw err;
      }
    },

    /**
     * Finds users in the same room within maxDistancePx of userId.
     * Uses MongoDB's 2D $near index for fast indexed lookup.
     * Returns closest first and excludes userId itself.
     *
     * @param {string} userId - ID of the reference player
     * @param {number} maxDistancePx - Radius in pixels to search (e.g. DISCONNECT_PX = 140)
     * @returns {Promise<Array<{ id: string, distance: number }>>}
     */
    async findNearby(userId, maxDistancePx) {
      if (!userId) {
        return [];
      }
      if (typeof maxDistancePx !== 'number' || maxDistancePx <= 0) {
        return [];
      }

      const idStr = String(userId);

      try {
        // Step 1: Look up current user position from cache or database
        let loc = positionCache.get(idStr);
        if (!loc) {
          const selfDoc = await Position.findOne({ _id: idStr, roomId }, { loc: 1 }).lean();
          if (!selfDoc || !Array.isArray(selfDoc.loc)) {
            return [];
          }
          loc = selfDoc.loc;
          positionCache.set(idStr, loc);
        }

        const [x0, y0] = loc;

        // Step 2: Query nearby users within same room using 2d $near index
        // Excluding the user themselves via $ne, selecting only loc
        const nearbyDocs = await Position.find(
          {
            roomId,
            _id: { $ne: idStr },
            loc: {
              $near: [x0, y0],
              $maxDistance: maxDistancePx,
            },
          },
          { loc: 1 }
        ).lean();

        // Step 3: Compute Euclidean pixel distance Math.hypot(dx, dy)
        const results = [];
        for (const doc of nearbyDocs) {
          const [x, y] = doc.loc;
          const distance = Math.hypot(x - x0, y - y0);

          // Double check radius boundary in case of index tolerance
          if (distance <= maxDistancePx) {
            results.push({
              id: doc._id,
              distance: Math.round(distance * 100) / 100,
            });
          }
        }

        // Ensure closest first
        results.sort((a, b) => a.distance - b.distance);
        return results;
      } catch (err) {
        console.error(`[geo] findNearby error for user ${userId} in room ${roomId}:`, err.message);
        throw err;
      }
    },

    /**
     * Removes a user's position document when they leave.
     *
     * @param {string} userId - ID of the player to remove
     * @returns {Promise<void>}
     */
    async removeUser(userId) {
      if (!userId) return;
      const idStr = String(userId);
      positionCache.delete(idStr);

      try {
        await Position.deleteOne({ _id: idStr, roomId });
      } catch (err) {
        console.error(`[geo] removeUser error for ${userId} in room ${roomId}:`, err.message);
        throw err;
      }
    },
  };
}
