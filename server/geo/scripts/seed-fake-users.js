// server/geo/scripts/seed-fake-users.js — Person 2 (Module 2: Geospatial engine)
// Seeds N fake users at random or deterministic spots in MongoDB.
// Usage: node server/geo/scripts/seed-fake-users.js [count] [--clean]
// Example: node server/geo/scripts/seed-fake-users.js 50

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDb, disconnectDb } from '../db.js';
import { Position } from '../models/Position.js';
import { DEFAULT_ROOM, WORLD_MAX_PX } from '../../../shared/constants.js';

// Load .env from repo root
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

/**
 * Seed fake user positions in MongoDB.
 * @param {object} options
 * @param {number} [options.count=50] - Number of fake users to seed
 * @param {string} [options.roomId=DEFAULT_ROOM] - Room to place users in
 * @param {boolean} [options.clean=false] - Whether to clean existing fake users first
 * @param {number|null} [options.seed=null] - Optional PRNG seed for reproducible test layouts
 * @returns {Promise<Array<{ id: string, x: number, y: number }>>}
 */
export async function seedFakeUsers({ count = 50, roomId = DEFAULT_ROOM, clean = false, seed = null } = {}) {
  await Position.init();

  if (clean) {
    const res = await Position.deleteMany({ roomId, _id: /^fake-user-/ });
    console.log(`[geo] Cleaned ${res.deletedCount} existing fake users from room "${roomId}"`);
  }

  // Simple pseudo-random generator if seed is provided, else Math.random
  let random = Math.random;
  if (seed !== null) {
    let s = seed;
    random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  const users = [];
  const minCoord = 100;
  const maxCoord = Math.min(WORLD_MAX_PX - 100, 3900);

  for (let i = 1; i <= count; i++) {
    const id = `fake-user-${i}`;
    const x = Math.round(minCoord + random() * (maxCoord - minCoord));
    const y = Math.round(minCoord + random() * (maxCoord - minCoord));
    users.push({ id, x, y });
  }

  // Bulk upsert into MongoDB
  const bulkOps = users.map((u) => ({
    updateOne: {
      filter: { _id: u.id },
      update: {
        $set: {
          roomId,
          loc: [u.x, u.y],
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await Position.bulkWrite(bulkOps);
  const writtenCount = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);

  console.log(`[geo] Seeded ${writtenCount} fake users in room "${roomId}" (upserted: ${result.upsertedCount || 0}, matched: ${result.matchedCount || 0})`);
  return users;
}

// Allow running directly from command line
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  let count = 50;
  let clean = false;

  for (const arg of args) {
    if (arg === '--clean') {
      clean = true;
    } else if (!Number.isNaN(Number(arg))) {
      count = Number(arg);
    }
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';

  connectDb(mongoUri)
    .then(() => seedFakeUsers({ count, clean }))
    .then(() => disconnectDb())
    .catch((err) => {
      console.error('[geo] Seeding failed:', err);
      process.exit(1);
    });
}
