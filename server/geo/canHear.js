// server/geo/canHear.js — Module 2 (Geospatial engine), v6
// The ROOM RULES as pure functions: "can this person hear that person, and how?"
// Pure = they only look at their inputs (no database, no network), so every rule is easy to test.
//
// An AREA is a part of the map with a type (CONTRACTS.md section 11):
//   { id, floorId, name, type, box: [[x1, y1], [x2, y2]] }          a rectangle (top-left, bottom-right)
//   { id, floorId, name, type, polygon: [[x, y], [x, y], ...] }     or any polygon
//   a stage hall also has platform: [[x1, y1], [x2, y2]]           the stage itself, inside the hall
// Coordinates are the avatar's MIDDLE point (AVATAR_MIDDLE), the same point everywhere.
//
// The rules (the product decision):
//   open / lobby  proximity: within EARSHOT_PX, quieter with distance ('falloff')
//   private       everyone inside hears everyone inside at a constant volume ('full'), any distance;
//                 nobody outside hears in, nobody inside hears out
//   silent        nobody hears anybody
//   stage         whoever stands on the platform is heard by everyone in the hall ('full');
//                 people in the audience hear each other by proximity ('falloff')
//   DND           a person on Do Not Disturb hears nobody and is heard by nobody (checked first)

import { AUDIO_MODES, AVATAR_MIDDLE, DISCONNECT_PX, EARSHOT_PX, STATUSES, ZONE_TYPES } from '../../shared/constants.js';

/** The area types that are rooms with walls for sound: you can't hear in or out. */
const CLOSED_TYPES = new Set([ZONE_TYPES.PRIVATE, ZONE_TYPES.SILENT, ZONE_TYPES.STAGE]);

/** Is this area (or null = no area) a closed room? */
export function isClosedArea(area) {
  return Boolean(area) && CLOSED_TYPES.has(area.type);
}

/** Is the point inside the rectangle [[x1, y1], [x2, y2]]? Edges count as inside (like MongoDB's $box). */
export function isInBox(point, box) {
  const [[x1, y1], [x2, y2]] = box;
  return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
}

/**
 * Is the point inside the polygon? The "ray casting" test: draw a line from the point to the right
 * and count how many polygon edges it crosses. Odd = inside, even = outside.
 * Example: square [[0,0],[10,0],[10,10],[0,10]], point (5, 5) → crosses 1 edge → inside.
 */
export function isInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Is the point inside this area's shape (box or polygon)? */
export function isInArea(point, area) {
  if (Array.isArray(area.box)) return isInBox(point, area.box);
  if (Array.isArray(area.polygon)) return isInPolygon(point, area.polygon);
  return false;
}

/** The middle of an avatar standing at (x, y): the point every area test uses. */
export function middleOf(x, y) {
  return { x: x + AVATAR_MIDDLE.x, y: y + AVATAR_MIDDLE.y };
}

/**
 * Which area is an avatar at (x, y) standing in? The first matching area, or null (no area = open floor).
 * Used where the server must answer straight away (area chat) and as the in-memory engine when
 * MongoDB is not available. With MongoDB, the tick asks the database instead ($geoWithin).
 * Example: areas = [meeting room box [[300,100],[600,300]]], avatar at (400, 150) → middle (412, 166) → the meeting room.
 *
 * @param {Array<object>} areas
 * @param {number} x
 * @param {number} y
 * @returns {object | null}
 */
export function areaAt(areas, x, y) {
  const point = middleOf(x, y);
  return areas.find((area) => isInArea(point, area)) || null;
}

/** Is an avatar at (x, y) standing on this stage hall's platform? */
export function isOnPlatform(area, x, y) {
  return Boolean(area) && area.type === ZONE_TYPES.STAGE && Array.isArray(area.platform) && isInBox(middleOf(x, y), area.platform);
}

/** Not audible. `mode` is only meaningful when audible is true; we still give a valid one. */
const SILENCE = Object.freeze({ audible: false, mode: AUDIO_MODES.FALLOFF });

/**
 * Can `listener` hear `speaker`, and in which mode? Directional on purpose: on a stage the audience
 * hears the speaker at full volume, but the speaker hears the audience only by proximity.
 *
 * Each person: { x, y, status, area, onPlatform }
 *   x, y        position (top-left of the avatar, as everywhere)
 *   status      one of STATUSES (DND overrides everything)
 *   area        the area they stand in (from areaAt or the $geoWithin lookup), or null
 *   onPlatform  true when they stand on their stage hall's platform
 * options.connected: are they already connected? Then the open-floor limit is DISCONNECT_PX (140)
 * instead of EARSHOT_PX (100): the gap stops connections flickering at the edge.
 *
 * Examples:
 *   both in 'Meeting room 2', 300 px apart            → { audible: true,  mode: 'full' }
 *   one in 'Meeting room 2', the other in the corridor → { audible: false }
 *   both in the focus room, side by side               → { audible: false }
 *   listener in the hall audience, speaker on stage    → { audible: true,  mode: 'full' }
 *   both on open floor, 60 px apart                    → { audible: true,  mode: 'falloff' }
 *
 * @returns {{ audible: boolean, mode: 'full' | 'falloff' }}
 */
export function canHear(listener, speaker, { connected = false } = {}) {
  // 1. Do Not Disturb beats every other rule.
  if (listener.status === STATUSES.DND || speaker.status === STATUSES.DND) return SILENCE;

  const listenerArea = listener.area || null;
  const speakerArea = speaker.area || null;

  // 2. A focus room: nobody hears anybody, in or out.
  if (listenerArea?.type === ZONE_TYPES.SILENT || speakerArea?.type === ZONE_TYPES.SILENT) return SILENCE;

  const sameArea = listenerArea !== null && speakerArea !== null && listenerArea.id === speakerArea.id;

  if (sameArea && listenerArea.type === ZONE_TYPES.PRIVATE) {
    // 3. Same private room: constant volume, any distance.
    return { audible: true, mode: AUDIO_MODES.FULL };
  }

  if (sameArea && listenerArea.type === ZONE_TYPES.STAGE) {
    // 4. Same stage hall: the speaker on the platform reaches everyone; otherwise proximity.
    if (speaker.onPlatform) return { audible: true, mode: AUDIO_MODES.FULL };
    return byDistance(listener, speaker, connected);
  }

  // 5. Different areas: a closed room (private / stage) on either side keeps sound in and out.
  if (!sameArea && (isClosedArea(listenerArea) || isClosedArea(speakerArea))) return SILENCE;

  // 6. Both on open floor (no area, or open / lobby areas): proximity.
  return byDistance(listener, speaker, connected);
}

/** Open-floor hearing: within the limit → 'falloff' (the mixer makes it quieter with distance). */
function byDistance(listener, speaker, connected) {
  const limit = connected ? DISCONNECT_PX : EARSHOT_PX;
  const distance = Math.hypot(speaker.x - listener.x, speaker.y - listener.y);
  return distance <= limit ? { audible: true, mode: AUDIO_MODES.FALLOFF } : SILENCE;
}

/**
 * Should these two people have a voice connection at all? A WebRTC connection carries sound both
 * ways, so it is needed when EITHER of them can hear the other (e.g. the audience hears the stage).
 */
export function shouldConnect(a, b, options) {
  return canHear(a, b, options).audible || canHear(b, a, options).audible;
}
