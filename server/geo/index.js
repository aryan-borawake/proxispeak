// server/geo/index.js — Person 2 (Module 2: Geospatial engine)
// Public API for the Geospatial Engine.
// Exact names and signatures: CONTRACTS.md (Section 6: Server module interfaces).

export { connectDb, disconnectDb } from './db.js';
export { createGeoEngine } from './geoEngine.js';
export { computePeerChanges } from './peerChanges.js';
export { Position } from './models/Position.js';

// PLANNED Week 3: usersInZone(zone) via $geoWithin; canHear(a, b) → { audible, mode }
