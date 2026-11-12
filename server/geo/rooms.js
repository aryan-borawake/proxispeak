// server/geo/rooms.js — Module 2 (Geospatial engine), v6 ("Room Persistence", spec Week 4)
// Saving and loading each floor's office layout (the Tiled map + desks + areas) in the `rooms`
// collection, with a version number. Also the check that an uploaded Tiled map is usable.
//
// Without MongoDB (no MONGODB_URI, labs on a laptop) the same functions keep the rooms in memory, so
// the app still works; nothing survives a restart then.
//
// Example: the admin uploads a new floor-1 layout →
//   validateTiledMap(json) → { ok: true, areas: [ …from the "zones" layer… ] }
//   saveUploadedRoom('floor-1', json, areas) → { version: 4, source: 'uploaded', … }

import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { TILE_SIZE, WORLD_MAX_PX, ZONE_TYPES } from '../../shared/constants.js';
import { Room } from './models/Room.js';

// Layers an uploaded map must have (CONTRACTS.md section 10).
export const REQUIRED_TILE_LAYERS = ['floor', 'walls', 'furniture', 'collision'];
export const REQUIRED_OBJECT_LAYERS = ['zones', 'spawn'];

// Rooms kept here when MongoDB is not connected (roomId → document).
const memoryRooms = new Map();

/** Is Mongoose connected right now? (readyState 1 = connected) */
function hasDatabase() {
  return mongoose.connection.readyState === 1;
}

/** A short fingerprint of a map, so we can tell whether it changed. */
export function hashMap(map) {
  return createHash('sha256').update(JSON.stringify(map)).digest('hex').slice(0, 16);
}

/** A Tiled custom property by name ({ name, type, value } list), or undefined. */
function property(object, name) {
  return (object.properties || []).find((p) => p.name === name)?.value;
}

/**
 * Turn the map's "zones" layer into areas. Each rectangle object needs the custom properties
 * zoneType (one of ZONE_TYPES) and name; areaId is optional (else made from the name); a stage hall
 * may have platform = "x1,y1,x2,y2". Polygon objects become polygon areas.
 * @returns {{ areas: Array<object>, errors: string[] }}
 */
export function areasFromTiledMap(map) {
  const errors = [];
  const areas = [];
  const zones = (map.layers || []).find((layer) => layer.name === 'zones' && layer.type === 'objectgroup');
  if (!zones) return { areas, errors: ['no "zones" object layer'] };
  const usedIds = new Set();
  zones.objects.forEach((object, index) => {
    const type = property(object, 'zoneType');
    const name = property(object, 'name') || object.name;
    const where = `zones object ${index + 1}${name ? ` ("${name}")` : ''}`;
    if (!Object.values(ZONE_TYPES).includes(type)) {
      errors.push(`${where}: zoneType must be one of ${Object.values(ZONE_TYPES).join(', ')}`);
      return;
    }
    if (!name) {
      errors.push(`${where}: needs a name`);
      return;
    }
    let id = String(property(object, 'areaId') || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    const area = { id, name, type };
    if (Array.isArray(object.polygon) && object.polygon.length >= 3) {
      area.polygon = object.polygon.map((p) => [object.x + p.x, object.y + p.y]);
    } else if (object.width > 0 && object.height > 0) {
      area.box = [[object.x, object.y], [object.x + object.width, object.y + object.height]];
    } else {
      errors.push(`${where}: must be a rectangle (width and height above 0) or a polygon`);
      return;
    }
    const platform = property(object, 'platform');
    if (type === ZONE_TYPES.STAGE && typeof platform === 'string') {
      const numbers = platform.split(',').map(Number);
      if (numbers.length === 4 && numbers.every(Number.isFinite)) area.platform = [[numbers[0], numbers[1]], [numbers[2], numbers[3]]];
      else errors.push(`${where}: platform must be "x1,y1,x2,y2"`);
    }
    areas.push(area);
  });
  // Rooms (private, silent, stage) first, so they win over an open area drawn around them.
  const closed = (a) => a.type === ZONE_TYPES.PRIVATE || a.type === ZONE_TYPES.SILENT || a.type === ZONE_TYPES.STAGE;
  areas.sort((a, b) => Number(closed(b)) - Number(closed(a)));
  return { areas, errors };
}

/**
 * Is this a Tiled map our office can use? Checks the format, the size, the embedded tilesets and the
 * required layers, and reads the areas.
 * @returns {{ ok: boolean, errors: string[], areas: Array<object> }}
 */
export function validateTiledMap(map) {
  const errors = [];
  if (!map || typeof map !== 'object' || !Array.isArray(map.layers)) {
    return { ok: false, errors: ['not a Tiled map: export it from Tiled as JSON (File → Export As → .json)'], areas: [] };
  }
  if (map.orientation !== 'orthogonal') errors.push('orientation must be "orthogonal"');
  if (map.tilewidth !== TILE_SIZE || map.tileheight !== TILE_SIZE) errors.push(`tiles must be ${TILE_SIZE} × ${TILE_SIZE} px`);
  if (!(map.width > 0 && map.height > 0) || map.width * TILE_SIZE > WORLD_MAX_PX || map.height * TILE_SIZE > WORLD_MAX_PX) {
    errors.push(`the map must be at most ${WORLD_MAX_PX / TILE_SIZE} × ${WORLD_MAX_PX / TILE_SIZE} tiles`);
  }
  if (!Array.isArray(map.tilesets) || map.tilesets.length === 0 || map.tilesets.some((t) => t.source)) {
    errors.push('tilesets must be embedded in the map (in Tiled: Map → Embed Tilesets)');
  }
  for (const name of REQUIRED_TILE_LAYERS) {
    const layer = map.layers.find((l) => l.name === name);
    if (!layer || layer.type !== 'tilelayer') errors.push(`missing tile layer "${name}"`);
    else if (!Array.isArray(layer.data) || layer.data.length !== map.width * map.height) errors.push(`layer "${name}" must have ${map.width * map.height} tiles (uncompressed CSV/JSON data)`);
  }
  for (const name of REQUIRED_OBJECT_LAYERS) {
    const layer = map.layers.find((l) => l.name === name);
    if (!layer || layer.type !== 'objectgroup') errors.push(`missing object layer "${name}"`);
  }
  const spawnLayer = map.layers.find((l) => l.name === 'spawn' && l.type === 'objectgroup');
  if (spawnLayer && !spawnLayer.objects.some((o) => o.name === 'spawn')) errors.push('the "spawn" layer needs a point named "spawn"');
  const { areas, errors: areaErrors } = areasFromTiledMap(map);
  errors.push(...areaErrors);
  return { ok: errors.length === 0, errors, areas };
}

/** The list shape (no big map): for the admin's Layouts section. */
function summary(room) {
  return { _id: room._id, floorId: room.floorId, name: room.name, version: room.version, source: room.source, updatedAt: room.updatedAt, mapHash: room.mapHash, areas: room.areas.length, desks: room.desks.length };
}

/** One floor's stored layout (with the map), or null. */
export async function loadRoom(roomId) {
  if (!hasDatabase()) return memoryRooms.get(roomId) || null;
  return Room.findById(roomId).lean();
}

/** Every stored layout, without the maps. */
export async function listRooms() {
  const rooms = hasDatabase() ? await Room.find({}, { map: 0 }).lean() : [...memoryRooms.values()];
  return rooms.map((room) => summary({ ...room, desks: room.desks || [], areas: room.areas || [] })).sort((a, b) => a._id.localeCompare(b._id));
}

/** Save (insert or replace) one room document. */
async function writeRoom(room) {
  if (!hasDatabase()) {
    memoryRooms.set(room._id, room);
    return room;
  }
  await Room.replaceOne({ _id: room._id }, room, { upsert: true });
  return room;
}

/**
 * At start-up (and for a new floor): make sure this floor has a stored layout.
 *   - none yet                          → store the generated one as version 1
 *   - the generated one, but it changed → store the new generated one as version + 1
 *   - an uploaded one                   → keep it (the admin's upload wins over the generator)
 * @param {{ floorId: string, name: string, map: object, desks: Array, areas: Array, mapHash: string }} generated
 * @returns {Promise<object>} the stored room
 */
export async function ensureGeneratedRoom({ floorId, name, map, desks, areas, mapHash }, { force = false } = {}) {
  const existing = await loadRoom(floorId);
  // force: the admin asked to go back to the generated layout (it becomes the next version).
  if (!force && existing && (existing.source === 'uploaded' || existing.mapHash === mapHash)) return existing;
  const version = existing ? existing.version + 1 : 1;
  return writeRoom({ _id: floorId, floorId, name, map, desks, areas, version, source: 'generated', mapHash, updatedAt: new Date() });
}

/**
 * The admin uploaded a Tiled JSON for this floor: save it as the next version. The desks stay the
 * stored ones (they belong to the employee directory); the areas come from the map's zones layer.
 * @returns {Promise<object>} the stored room
 */
export async function saveUploadedRoom(floorId, map, areas, { name, desks } = {}) {
  const existing = await loadRoom(floorId);
  const version = existing ? existing.version + 1 : 1;
  return writeRoom({
    _id: floorId,
    floorId,
    name: name || existing?.name || floorId,
    map,
    desks: desks || existing?.desks || [],
    areas,
    version,
    source: 'uploaded',
    mapHash: hashMap(map),
    updatedAt: new Date(),
  });
}
