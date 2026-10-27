// server/geo/scripts/test-nearby.js — Person 2 (Module 2: Geospatial engine)
// Deterministic known-distance and hysteresis boundary test suite.
// Verifies:
//   - Known distances (50, 99, 100, 101, 140, 150 px)
//   - Exact hysteresis boundaries (100.0 px enters, 100.01 px ignores, 140.0 px stays, 140.01 px leaves)
//   - Coordinate validation (rejection of NaN, negative, and > WORLD_MAX_PX)
//   - Closest-first ordering
//   - Self-exclusion
//   - Room isolation
//   - removeUser behavior
//   - Guaranteed cleanup in finally and reliable disconnect on error
// Run with: node server/geo/scripts/test-nearby.js

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDb, disconnectDb } from '../db.js';
import { createGeoEngine } from '../geoEngine.js';
import { computePeerChanges } from '../peerChanges.js';
import { Position } from '../models/Position.js';
import { EARSHOT_PX, DISCONNECT_PX, WORLD_MAX_PX } from '../../../shared/constants.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failedCount++;
  }
}

export async function runNearbyTests() {
  console.log('\n=== RUNNING GEOSPATIAL ENGINE DETERMINISTIC TESTS ===\n');

  const testRoom = `test-room-${Date.now()}`;
  const otherRoom = `other-room-${Date.now()}`;
  const geo = createGeoEngine({ roomId: testRoom });
  const otherGeo = createGeoEngine({ roomId: otherRoom });

  await Position.init();

  try {
    // ---------------------------------------------------------
    // SECTION 1: DATABASE DETERMINISTIC DISTANCE CHECKS
    // ---------------------------------------------------------
    console.log('--- Suite 1: Known Distance & Spatial Index Checks ---');

    // Place target user at (500, 500)
    // user-50   at (550, 500) -> distance exactly 50 px
    // user-99   at (500, 599) -> distance exactly 99 px
    // user-100  at (500, 600) -> distance exactly 100 px (exact connect boundary)
    // user-101  at (500, 399) -> distance exactly 101 px
    // user-140  at (500, 640) -> distance exactly 140 px (exact disconnect boundary)
    // user-150  at (650, 500) -> distance exactly 150 px
    const testUsers = [
      { id: 'target', x: 500, y: 500 },
      { id: 'user-50', x: 550, y: 500 },
      { id: 'user-99', x: 500, y: 599 },
      { id: 'user-100', x: 500, y: 600 },
      { id: 'user-101', x: 500, y: 399 },
      { id: 'user-140', x: 500, y: 640 },
      { id: 'user-150', x: 650, y: 500 },
    ];

    await geo.upsertPositions(testUsers);

    // Test 1.1: Query radius 100 px (EARSHOT_PX)
    // Must find: user-50, user-99, and user-100 (exact threshold)
    const nearby100 = await geo.findNearby('target', EARSHOT_PX);
    assert(
      nearby100.length === 3,
      'Radius 100 px finds exactly 3 users (50, 99, and 100 px)',
      `Found ${nearby100.length}`
    );
    assert(
      nearby100[0]?.id === 'user-50' && nearby100[0]?.distance === 50,
      'user-50 is first with distance 50 px'
    );
    assert(
      nearby100[1]?.id === 'user-99' && nearby100[1]?.distance === 99,
      'user-99 is second with distance 99 px'
    );
    assert(
      nearby100[2]?.id === 'user-100' && nearby100[2]?.distance === 100,
      'user-100 is third with distance 100 px (exact connect threshold included)'
    );
    assert(
      !nearby100.some((u) => u.id === 'user-101' || u.id === 'user-140' || u.id === 'user-150'),
      'user-101, user-140, and user-150 are excluded at radius 100 px'
    );

    // Test 1.2: Query radius 140 px (DISCONNECT_PX)
    // Must find: user-50, user-99, user-100, user-101, and user-140 (exact threshold)
    const nearby140 = await geo.findNearby('target', DISCONNECT_PX);
    assert(
      nearby140.length === 5,
      'Radius 140 px finds exactly 5 users (50, 99, 100, 101, 140 px)',
      `Found ${nearby140.length}`
    );
    assert(
      nearby140.some((u) => u.id === 'user-101' && u.distance === 101),
      'user-101 is included at radius 140 px with distance 101 px'
    );
    assert(
      nearby140.some((u) => u.id === 'user-140' && u.distance === 140),
      'user-140 is included at radius 140 px with distance 140 px (exact disconnect threshold included)'
    );
    assert(
      !nearby140.some((u) => u.id === 'user-150'),
      'user-150 (150 px) is excluded at radius 140 px'
    );

    // Test 1.3: Self-exclusion
    assert(
      !nearby140.some((u) => u.id === 'target'),
      'Requesting user (target) is never included in their own nearby results'
    );

    // Test 1.4: Room Isolation
    // Put another user very close (10 px away at (510, 500)) but in otherRoom
    await otherGeo.upsertPositions([{ id: 'other-room-user', x: 510, y: 500 }]);
    const nearbyWithOtherRoom = await geo.findNearby('target', EARSHOT_PX);
    assert(
      !nearbyWithOtherRoom.some((u) => u.id === 'other-room-user'),
      'User in different room is isolated and excluded from nearby results'
    );

    // Test 1.5: User Removal
    await geo.removeUser('user-50');
    const afterRemoval = await geo.findNearby('target', EARSHOT_PX);
    assert(
      afterRemoval.length === 2 && !afterRemoval.some((u) => u.id === 'user-50'),
      'removeUser successfully removes user from nearby results'
    );

    // Test 1.6: Coordinate Validation
    // Attempt inserting invalid coordinates (NaN, negative, > WORLD_MAX_PX)
    await geo.upsertPositions([
      { id: 'invalid-nan', x: NaN, y: 500 },
      { id: 'invalid-neg', x: -50, y: 500 },
      { id: 'invalid-huge', x: 5000, y: 500 },
    ]);
    const invalidDoc = await Position.findOne({
      roomId: testRoom,
      _id: { $in: ['invalid-nan', 'invalid-neg', 'invalid-huge'] },
    });
    assert(
      invalidDoc === null,
      'Invalid coordinates (NaN, negative, > WORLD_MAX_PX) are safely rejected'
    );

    // ---------------------------------------------------------
    // SECTION 2: PURE HYSTERESIS PEER TRANSITION CHECKS
    // ---------------------------------------------------------
    console.log('\n--- Suite 2: computePeerChanges Hysteresis Rules ---');

    // Case 2.1: Disconnected peer within EARSHOT_PX (80 px) enters
    const res21 = computePeerChanges(new Set(), [{ id: 'u80', distance: 80 }]);
    assert(
      res21.entered.includes('u80') && res21.left.length === 0,
      'Disconnected user at 80 px (< 100) enters'
    );

    // Case 2.1b: Disconnected peer at EXACTLY 100.0 px enters
    const res21b = computePeerChanges(new Set(), [{ id: 'u100', distance: 100 }]);
    assert(
      res21b.entered.includes('u100') && res21b.left.length === 0,
      'Disconnected user at EXACT boundary 100.0 px enters'
    );

    // Case 2.1c: Disconnected peer at 100.01 px does NOT enter
    const res21c = computePeerChanges(new Set(), [{ id: 'u100_01', distance: 100.01 }]);
    assert(
      res21c.entered.length === 0 && res21c.left.length === 0,
      'Disconnected user at 100.01 px (> 100) does not enter'
    );

    // Case 2.2: Connected peer at 120 px (100 < dist <= 140) stays connected
    const res22 = computePeerChanges(new Set(['u120']), [{ id: 'u120', distance: 120 }]);
    assert(
      res22.entered.length === 0 && res22.left.length === 0,
      'Connected user at 120 px (<= 140) stays connected (neither entered nor left)'
    );

    // Case 2.2b: Connected peer at EXACTLY 140.0 px stays connected
    const res22b = computePeerChanges(new Set(['u140']), [{ id: 'u140', distance: 140 }]);
    assert(
      res22b.entered.length === 0 && res22b.left.length === 0,
      'Connected user at EXACT boundary 140.0 px stays connected'
    );

    // Case 2.2c: Connected peer at 140.01 px leaves
    const res22c = computePeerChanges(new Set(['u140_01']), [{ id: 'u140_01', distance: 140.01 }]);
    assert(
      res22c.left.includes('u140_01') && res22c.entered.length === 0,
      'Connected user at 140.01 px (> 140) leaves'
    );

    // Case 2.3: Disconnected peer at 120 px does NOT enter
    const res23 = computePeerChanges(new Set(), [{ id: 'u120', distance: 120 }]);
    assert(
      res23.entered.length === 0 && res23.left.length === 0,
      'Disconnected user at 120 px does not enter'
    );

    // Case 2.4: Connected peer at 150 px (> 140) leaves
    const res24 = computePeerChanges(new Set(['u150']), [{ id: 'u150', distance: 150 }]);
    assert(
      res24.left.includes('u150') && res24.entered.length === 0,
      'Connected user at 150 px (> 140) leaves'
    );

    // Case 2.5: Connected peer missing from nearby list leaves
    const res25 = computePeerChanges(new Set(['uMissing']), []);
    assert(
      res25.left.includes('uMissing') && res25.entered.length === 0,
      'Connected user missing from nearby query leaves'
    );

    // Case 2.6: CONTRACTS.md Worked Example
    // Current peers: u2, u3. Nearby: [{ id: 'u2', distance: 120 }, { id: 'u4', distance: 80 }]
    // Expected: entered: ['u4'], left: ['u3'] (u2 stays)
    const contractExample = computePeerChanges(
      new Set(['u2', 'u3']),
      [
        { id: 'u2', distance: 120 },
        { id: 'u4', distance: 80 },
      ],
      { connectPx: EARSHOT_PX, disconnectPx: DISCONNECT_PX }
    );
    assert(
      contractExample.entered.length === 1 &&
        contractExample.entered[0] === 'u4' &&
        contractExample.left.length === 1 &&
        contractExample.left[0] === 'u3',
      'Matches CONTRACTS.md worked example: entered [u4], left [u3], u2 stays'
    );
  } catch (err) {
    console.error('[geo] Unexpected test error:', err);
    failedCount++;
  } finally {
    // Guaranteed cleanup in finally block
    try {
      await Position.deleteMany({ roomId: { $in: [testRoom, otherRoom] } });
      console.log(`\n[geo] Cleaned up test rooms ${testRoom} and ${otherRoom}`);
    } catch (cleanErr) {
      console.error('[geo] Cleanup error:', cleanErr.message);
    }
  }

  console.log('\n=== TEST RESULTS SUMMARY ===');
  console.log(`Total tests: ${passedCount + failedCount}`);
  console.log(`Passed:      ${passedCount}`);
  console.log(`Failed:      ${failedCount}`);

  if (failedCount > 0) {
    console.error('\nFAIL: Some tests did not pass.\n');
    return false;
  }

  console.log('\nALL TESTS PASSED SUCCESSFULLY!\n');
  return true;
}

// Execute directly if run as main
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';

  connectDb(mongoUri)
    .then(() => runNearbyTests())
    .then((success) => {
      process.exitCode = success ? 0 : 1;
    })
    .catch((err) => {
      console.error('[geo] Fatal error running tests:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectDb();
    });
}
