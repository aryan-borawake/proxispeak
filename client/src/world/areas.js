// client/src/world/areas.js — Person 3's world module, v6 (added by Person 1)
// "Which area am I standing in?" in the browser, so the map can highlight it the moment I step in.
// The SERVER decides who hears whom (server/geo/canHear.js); this copy only draws and labels.
//
// An area: { id, name, type, box: [[x1, y1], [x2, y2]] } or { …, polygon: [[x, y], …] }, in map px,
// around the avatar's MIDDLE point (AVATAR_MIDDLE: 12 px right and 16 px down from its top-left).

import { AVATAR_MIDDLE, ZONE_TYPES } from '@shared/constants.js';

/** The area types that are rooms for sound (highlighted, with an area chat). */
const CLOSED_TYPES = new Set([ZONE_TYPES.PRIVATE, ZONE_TYPES.SILENT, ZONE_TYPES.STAGE]);

/** Is this area (or null) a room: private, silent or stage? */
export function isClosedArea(area) {
  return Boolean(area) && CLOSED_TYPES.has(area.type);
}

/** Is the point inside the area? Boxes include their edges; polygons use the ray-crossing test. */
export function isInArea(point, area) {
  if (Array.isArray(area.box)) {
    const [[x1, y1], [x2, y2]] = area.box;
    return point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2;
  }
  if (Array.isArray(area.polygon)) {
    let inside = false;
    const polygon = area.polygon;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

/**
 * The area an avatar at (x, y) stands in, or null (open floor).
 * Example: a meeting room box [[300, 100], [600, 300]], avatar at (400, 150) → middle (412, 166) → that room.
 */
export function areaAt(areas, x, y) {
  if (!Array.isArray(areas)) return null;
  const middle = { x: x + AVATAR_MIDDLE.x, y: y + AVATAR_MIDDLE.y };
  return areas.find((area) => isInArea(middle, area)) || null;
}

/** Trace an area's outline as a canvas path (no beginPath: the caller adds it to its own path). */
export function traceArea(ctx, area) {
  if (Array.isArray(area.box)) {
    const [[x1, y1], [x2, y2]] = area.box;
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
  } else if (Array.isArray(area.polygon)) {
    area.polygon.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }
}
