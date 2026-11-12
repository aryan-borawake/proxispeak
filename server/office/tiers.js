// server/office/tiers.js — Person 1
// Tiers: how much of a floor is open. Pure functions (no database, no network), so they are easy to
// test (server/scripts/office-rules-test.js).
//
// A floor has four desk wings, A–D, with 25 desks each (DESKS_PER_WING). The tier is the number of
// open wings:
//   tier 1 → wing A                 (up to 25 people)
//   tier 2 → wings A + B            (up to 50)
//   tier 3 → wings A + B + C        (up to 75)
//   tier 4 → all four wings         (up to 100)
// A floor's tier is the smallest tier that fits its headcount AND every wing that already has a desk
// in use or reserved for a department. It only grows: if people leave, wings stay open (nobody gets
// locked out of their desk).
//
// Example: 26 people → tierForHeadcount(26) = 2 → wings A and B are open.

import { DESKS_PER_WING, WING_IDS } from '../../shared/constants.js';

/** The smallest tier that fits `headcount` people. 0 people → tier 1 (wing A is always open). */
export function tierForHeadcount(headcount) {
  const needed = Math.ceil(Math.max(0, headcount) / DESKS_PER_WING);
  return Math.min(WING_IDS.length, Math.max(1, needed));
}

/** The tier at which a wing opens. Example: 'A' → 1, 'C' → 3. */
export function tierOfWing(wingId) {
  return WING_IDS.indexOf(wingId) + 1;
}

/** The open wings at a tier. Example: 2 → ['A', 'B']. */
export function openWingsForTier(tier) {
  return WING_IDS.slice(0, Math.max(1, Math.min(WING_IDS.length, tier)));
}

/**
 * A floor's tier: never smaller than before, big enough for the headcount, and big enough to
 * include every wing that holds a used or reserved desk.
 * Example: computeFloorTier({ previousTier: 1, headcount: 17, usedWingIds: ['A', 'B'] }) → 2
 *
 * @param {{ previousTier: number, headcount: number, usedWingIds: string[] }} input
 * @returns {number} 1..4
 */
export function computeFloorTier({ previousTier = 1, headcount = 0, usedWingIds = [] }) {
  let tier = Math.max(previousTier, tierForHeadcount(headcount));
  for (const wingId of usedWingIds) {
    tier = Math.max(tier, tierOfWing(wingId));
  }
  return Math.min(WING_IDS.length, tier);
}
