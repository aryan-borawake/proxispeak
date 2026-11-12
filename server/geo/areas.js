// server/geo/areas.js — Module 2 (Geospatial engine), v6
// Saving and loading a floor's areas, and the two $geoWithin questions:
//   usersInArea(roomId, area)    "who stands inside this area?"     (one find with $geoWithin)
//   locateUsers(roomId, areas)   "which area is everybody in?"       (ONE aggregate for all areas)
//
// $geoWithin finds documents whose location lies INSIDE a shape. Our positions are plain [x, y] pixel
// pairs with a '2d' index, so the shapes are $box (a rectangle: bottom-left and top-right corners) or
// $polygon (a list of points). Example: everybody inside the rectangle from (300, 100) to (600, 300):
//   Position.find({ roomId: 'floor-1', loc: { $geoWithin: { $box: [[300, 100], [600, 300]] } } })
//
// One detail: a saved position is the avatar's TOP-LEFT corner, but areas are drawn around the avatar's
// MIDDLE (AVATAR_MIDDLE, 12 px right and 16 px down). So we shift each shape up-left by that much
// before asking: "middle inside the room" is the same as "top-left inside the shifted room".

import { AVATAR_MIDDLE } from '../../shared/constants.js';
import { Area } from './models/Area.js';
import { Position } from './models/Position.js';

/** The $geoWithin shape for an area (or a platform box), shifted to top-left coordinates. */
export function shapeOf(areaOrBox) {
  const shift = ([x, y]) => [x - AVATAR_MIDDLE.x, y - AVATAR_MIDDLE.y];
  if (Array.isArray(areaOrBox?.box)) return { $box: areaOrBox.box.map(shift) };
  if (Array.isArray(areaOrBox?.polygon)) return { $polygon: areaOrBox.polygon.map(shift) };
  if (Array.isArray(areaOrBox) && areaOrBox.length === 2) return { $box: areaOrBox.map(shift) };
  throw new Error('[geo] an area needs box: [[x1, y1], [x2, y2]] or polygon: [[x, y], ...]');
}

/**
 * Replace a floor's saved areas with these ones (one deleteMany + one insertMany).
 * Called at start-up and after the admin uploads a layout — never per move.
 *
 * @param {string} floorId - e.g. 'floor-1'
 * @param {Array<object>} areas - [{ id, name, type, box | polygon, platform? }]
 * @returns {Promise<number>} how many were saved
 */
export async function saveAreas(floorId, areas) {
  const now = new Date();
  const documents = areas.map((area) => ({
    _id: `${floorId}:${area.id}`,
    floorId,
    areaId: area.id,
    name: area.name,
    type: area.type,
    box: area.box,
    polygon: area.polygon,
    platform: area.platform,
    updatedAt: now,
  }));
  await Area.deleteMany({ floorId });
  if (documents.length > 0) await Area.insertMany(documents, { ordered: false });
  return documents.length;
}

/**
 * A floor's saved areas, in the shape the rules use ({ id, floorId, name, type, box | polygon, platform? }).
 * @param {string} floorId
 * @returns {Promise<Array<object>>}
 */
export async function loadAreas(floorId) {
  const documents = await Area.find({ floorId }).lean();
  return documents.map((doc) => {
    const area = { id: doc.areaId, floorId: doc.floorId, name: doc.name, type: doc.type };
    if (doc.box) area.box = doc.box;
    if (doc.polygon) area.polygon = doc.polygon;
    if (doc.platform) area.platform = doc.platform;
    return area;
  });
}

/**
 * The $geoWithin query for one area: everyone in this room whose avatar middle is inside it.
 * Returned as a Mongoose query, so a test or report can also call .explain() on it.
 * @param {string} roomId
 * @param {object} area
 */
export function usersInAreaQuery(roomId, area) {
  return Position.find({ roomId, loc: { $geoWithin: shapeOf(area) } }, { _id: 1 }).lean();
}

/**
 * Who is inside this area right now? (CONTRACTS.md: usersInZone / usersInArea)
 * @returns {Promise<string[]>} user ids
 */
export async function usersInArea(roomId, area) {
  const documents = await usersInAreaQuery(roomId, area);
  return documents.map((doc) => doc._id);
}

/**
 * Which area is EVERY user of this room in? One database trip for all areas at once:
 *   $match  the room's positions (uses the roomId index)
 *   $facet  one small pipeline per area: $match { loc: { $geoWithin: … } } → the ids inside.
 *           A stage hall gets a second one for its platform.
 * Example answer: Map { 'riya' → { areaId: 'meeting-2', onPlatform: false }, 'sam' → { areaId: 'stage-hall', onPlatform: true } }
 * People in no area are simply not in the Map (they are on open floor).
 *
 * @param {string} roomId
 * @param {Array<object>} areas
 * @returns {Promise<Map<string, { areaId: string, onPlatform: boolean }>>}
 */
export async function locateUsers(roomId, areas) {
  const located = new Map();
  if (areas.length === 0) return located;

  const facets = {};
  areas.forEach((area, index) => {
    facets[`a${index}`] = [{ $match: { loc: { $geoWithin: shapeOf(area) } } }, { $project: { _id: 1 } }];
    if (Array.isArray(area.platform)) {
      facets[`p${index}`] = [{ $match: { loc: { $geoWithin: shapeOf(area.platform) } } }, { $project: { _id: 1 } }];
    }
  });

  const [result] = await Position.aggregate([{ $match: { roomId } }, { $facet: facets }]);
  areas.forEach((area, index) => {
    for (const { _id } of result[`a${index}`] || []) {
      // Areas never overlap; if a point sits exactly on a shared edge, the first area wins.
      if (!located.has(_id)) located.set(_id, { areaId: area.id, onPlatform: false });
    }
    for (const { _id } of result[`p${index}`] || []) {
      if (located.get(_id)?.areaId === area.id) located.get(_id).onPlatform = true;
    }
  });
  return located;
}
