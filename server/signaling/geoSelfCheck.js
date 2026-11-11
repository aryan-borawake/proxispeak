// server/signaling/geoSelfCheck.js — Person 1 (Module 1: Signaling + WebRTC)
// A quick "does the geo engine really answer?" test, run once at start-up (Task 11).
//
// Why? connectDb() can succeed while the engine itself is not built yet. On this branch
// server/geo/ is still the stub: it connects "fine", but findNearby always returns [].
// If the server picked it, nobody would ever be connected to anybody. So before trusting the
// engine, we ask it one question we already know the answer to.
//
// The test, in a throwaway room so it can never touch the real office:
//   1. Save two probe users, 14 px apart: '__probe__' at (10, 10) and '__probe2__' at (20, 20).
//   2. Ask findNearby('__probe2__', EARSHOT_PX). The answer must include '__probe__'.
//   3. Delete both probes again (always, even if step 2 failed).
// Example: a working engine answers [{ id: '__probe__', distance: 14.14 }]  → pass.
//          the stub answers []                                             → fail.

import { EARSHOT_PX } from '../../shared/constants.js';

// The throwaway room. Real players are always in DEFAULT_ROOM ('office-1'), so findNearby
// for a real player never sees these probes.
const SELF_CHECK_ROOM = '__selfcheck__';

// Two probe users. Real players' ids are Socket.io ids (20 random characters, e.g. 'kX9a2bQ...'),
// so they never look like '__probe__'. Math.hypot(20 - 10, 20 - 10) ≈ 14 px, inside EARSHOT_PX (100).
const PROBE_A = { id: '__probe__', x: 10, y: 10 };
const PROBE_B = { id: '__probe2__', x: 20, y: 20 };

/**
 * Run the self-check. Resolves if the engine works; rejects with an Error that says why if not.
 * It does not set a time limit itself; server/index.js wraps it in a 5-second timeout.
 *
 * @param {(options: { roomId: string }) => object} createGeoEngine - Person 2's function
 * @returns {Promise<void>}
 */
export async function runGeoSelfCheck(createGeoEngine) {
  const engine = createGeoEngine({ roomId: SELF_CHECK_ROOM });

  try {
    await engine.upsertPositions([PROBE_A, PROBE_B]);

    const nearby = await engine.findNearby(PROBE_B.id, EARSHOT_PX);

    // Array.isArray: the answer must be a list, e.g. [{ id, distance }].
    if (!Array.isArray(nearby)) {
      throw new Error(`findNearby returned ${JSON.stringify(nearby)} instead of a list`);
    }
    const foundProbe = nearby.some((entry) => entry?.id === PROBE_A.id);
    if (!foundProbe) {
      throw new Error(
        `findNearby('${PROBE_B.id}', ${EARSHOT_PX}) did not return '${PROBE_A.id}' 14 px away ` +
          `(got ${JSON.stringify(nearby)})`,
      );
    }
  } finally {
    // Tidy up whatever happened above. A failed delete must not hide the real reason,
    // so cleanUp only logs its own errors.
    await cleanUp(engine);
  }
}

/** Delete both probes. Errors are logged, never thrown. */
async function cleanUp(engine) {
  for (const probe of [PROBE_A, PROBE_B]) {
    try {
      await engine.removeUser(probe.id);
    } catch (error) {
      console.warn(`[server] geo self-check: could not delete ${probe.id}: ${error.message}`);
    }
  }
}
