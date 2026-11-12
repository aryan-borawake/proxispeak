// server/office/layout.js — Person 1
// Loads layout.json (made by server/scripts/build-office-map.js): where every desk, hot desk, wing,
// room, the elevator and the spawn point are on a floor. Every floor uses the same layout.
// Also small helpers that answer "where is …?" questions with it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LAYOUT_PATH = fileURLToPath(new URL('./layout.json', import.meta.url));
const MAP_PATH = fileURLToPath(new URL('../../client/public/maps/office.json', import.meta.url));

/** The floor plan. Read once when the server starts. */
export const layout = JSON.parse(readFileSync(LAYOUT_PATH, 'utf8'));

// v6: the generated Tiled map that goes with it (stored in the `rooms` collection at start-up).
let officeMapCache = null;

/** The generated office map (client/public/maps/office.json), read the first time it is needed. */
export function officeMap() {
  if (!officeMapCache) officeMapCache = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
  return officeMapCache;
}

const desksById = new Map([...layout.desks, ...layout.hotDesks].map((desk) => [desk.id, desk]));

/** A desk or hot desk by id, or null. Example: deskById('A-07') → { id, wingId, x, y, … } */
export function deskById(deskId) {
  return desksById.get(deskId) || null;
}

/** Is the point (x, y) inside the rectangle { x, y, w, h }? */
export function isInsideRect(point, rect) {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}

/**
 * Which wing is an avatar standing in? Avatar positions are their top-left corner, so we test the
 * middle of the avatar (12 px right, 16 px down). Returns a wing id or null (not in a wing).
 */
export function wingAt(x, y) {
  const middle = { x: x + 12, y: y + 16 };
  const wing = layout.wings.find((w) => isInsideRect(middle, w.rect));
  return wing ? wing.id : null;
}
