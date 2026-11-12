// server/geo/scripts/explain-geowithin.js — Module 2 (Geospatial engine), v6
// Shows the $geoWithin query the server uses to find "who is inside this area", and MongoDB's
// .explain() for it: does it use our 2d index, and how many documents did it look at?
//
// Run it (MongoDB must be reachable through MONGODB_URI in the root .env):
//   node server/geo/scripts/explain-geowithin.js
// It saves a few probe positions in a throwaway room, asks, explains, and deletes them again.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDb, disconnectDb } from '../db.js';
import { createGeoEngine } from '../geoEngine.js';
import { shapeOf, usersInAreaQuery } from '../areas.js';
import { Position } from '../models/Position.js';
import { layout } from '../../office/layout.js';
import { ZONE_TYPES } from '../../../shared/constants.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

const ROOM = '__explain__';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in the root .env first.');
  await connectDb(process.env.MONGODB_URI);
  await Position.init();
  const engine = createGeoEngine({ roomId: ROOM });

  // A meeting room from the real floor plan, and 40 probe users: 3 inside it, the rest scattered.
  const room = layout.areas.find((area) => area.type === ZONE_TYPES.PRIVATE && area.id.startsWith('meeting')) || layout.areas[0];
  const [[x1, y1], [x2, y2]] = room.box;
  const probes = [];
  for (let i = 0; i < 3; i += 1) probes.push({ id: `__in${i}__`, x: x1 + 20 + i * 30, y: y1 + 20 });
  for (let i = 0; i < 37; i += 1) probes.push({ id: `__out${i}__`, x: (i * 97) % 3500, y: 1500 + ((i * 53) % 900) });
  await engine.upsertPositions(probes);

  const filter = { roomId: ROOM, loc: { $geoWithin: shapeOf(room) } };
  console.log(`[geo] area "${room.name}" box ${JSON.stringify(room.box)} (avatar-middle px)`);
  console.log('[geo] query: Position.find(' + JSON.stringify(filter) + ', { _id: 1 })');
  const inside = await engine.usersInArea(room);
  console.log(`[geo] answer: ${JSON.stringify(inside)}`);

  const explained = await usersInAreaQuery(ROOM, room).explain('executionStats');
  const plan = explained.queryPlanner.winningPlan;
  const stageNames = [];
  for (let stage = plan; stage; stage = stage.inputStage) stageNames.push(stage.stage + (stage.indexName ? ` (${stage.indexName})` : ''));
  const stats = explained.executionStats;
  console.log(`[geo] explain: winning plan ${stageNames.join(' ← ')}`);
  console.log(`[geo] explain: nReturned ${stats.nReturned}, totalKeysExamined ${stats.totalKeysExamined}, totalDocsExamined ${stats.totalDocsExamined}, executionTimeMillis ${stats.executionTimeMillis}`);

  const located = await engine.locateUsers(layout.areas);
  console.log(`[geo] locateUsers (one $facet aggregate over ${layout.areas.length} areas): ${JSON.stringify([...located])}`);

  for (const probe of probes) await engine.removeUser(probe.id);
  await disconnectDb();
}

main().catch(async (error) => {
  console.error(`[geo] explain failed: ${error.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
