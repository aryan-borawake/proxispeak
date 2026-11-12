// server/geo/index.js — Person 2 (Module 2: Geospatial engine)
// Public API for the Geospatial Engine.
// Exact names and signatures: CONTRACTS.md (Section 6: Server module interfaces).

export { connectDb, disconnectDb } from './db.js';
export { createGeoEngine } from './geoEngine.js';
export { computePeerChanges } from './peerChanges.js';
export { Position } from './models/Position.js';

// v6: areas (meeting rooms, pods, focus rooms, the stage hall) and the room rules.
export { Area } from './models/Area.js';
export { saveAreas, loadAreas, usersInArea, usersInAreaQuery, locateUsers, shapeOf } from './areas.js';
export { canHear, shouldConnect, areaAt, isOnPlatform, isInArea, isClosedArea, middleOf } from './canHear.js';

// v6: room persistence (the `rooms` collection) and its web addresses.
export { Room } from './models/Room.js';
export { ensureGeneratedRoom, saveUploadedRoom, loadRoom, listRooms, validateTiledMap, areasFromTiledMap, hashMap } from './rooms.js';
export { createRoomsRouter } from './routes.js';
