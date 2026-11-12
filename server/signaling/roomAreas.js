// server/signaling/roomAreas.js — Person 1, v6
// Which areas (meeting rooms, pods, focus rooms, the stage hall…) each room has, kept in memory.
//
// Every floor room ('floor-1', 'floor-2', …) uses the floor plan's areas (server/office/layout.json,
// made by the map build script) until a stored or uploaded layout replaces them (setRoomAreas, called
// by server/rooms/ at start-up and after an upload). Labs and robot tests (DEFAULT_ROOM) have NO areas:
// there, everybody is on open floor and hears by proximity, exactly as before v6.

import { DEFAULT_ROOM } from '../../shared/constants.js';
import { layout } from '../office/layout.js';

// roomId → [area]. A room missing here uses the floor plan's areas.
const areasByRoom = new Map();

/** Replace one room's areas (start-up, or an uploaded layout). */
export function setRoomAreas(roomId, areas) {
  areasByRoom.set(roomId, areas.map((area) => ({ ...area, floorId: roomId })));
}

/**
 * The areas of one room. Example: getRoomAreas('floor-1') → [{ id: 'meeting-2', type: 'private', … }, …]
 * @param {string} roomId
 * @returns {Array<object>}
 */
export function getRoomAreas(roomId) {
  if (roomId === DEFAULT_ROOM) return [];
  if (!areasByRoom.has(roomId)) setRoomAreas(roomId, layout.areas || []);
  return areasByRoom.get(roomId);
}

/** One area of a room by id, or null. */
export function getRoomArea(roomId, areaId) {
  return getRoomAreas(roomId).find((area) => area.id === areaId) || null;
}
