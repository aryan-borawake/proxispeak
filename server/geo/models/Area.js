// server/geo/models/Area.js — Module 2 (Geospatial engine), v6
// One saved AREA of a floor: a meeting room, a desk pod, the focus room, the stage hall…
// CONTRACTS.md section 9 (`areas`). The map build script makes them; the server saves them at start-up
// (and again when the admin uploads a new layout).
//
// Example document:
//   { _id: 'floor-1:meeting-2', floorId: 'floor-1', areaId: 'meeting-2', name: 'Meeting room 2',
//     type: 'private', box: [[1184, 416], [1471, 639]], updatedAt: … }
// box = [[x1, y1], [x2, y2]] (top-left and bottom-right, in px, avatar-middle coordinates);
// polygon = [[x, y], …] instead of box for odd shapes; platform = the stage inside a stage hall.

import mongoose from 'mongoose';
import { ZONE_TYPES } from '../../../shared/constants.js';

/** [x, y] pairs: an array of two finite numbers. */
function isPointList(value) {
  return Array.isArray(value) && value.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
}

const areaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // `${floorId}:${areaId}`, readable and unique
    floorId: { type: String, required: true, index: true },
    areaId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: Object.values(ZONE_TYPES) },
    box: { type: [[Number]], default: undefined, validate: { validator: (v) => v === undefined || (isPointList(v) && v.length === 2), message: 'box must be [[x1, y1], [x2, y2]]' } },
    polygon: { type: [[Number]], default: undefined, validate: { validator: (v) => v === undefined || (isPointList(v) && v.length >= 3), message: 'polygon needs at least 3 [x, y] points' } },
    platform: { type: [[Number]], default: undefined },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false, collection: 'areas', versionKey: false },
);

export const Area = mongoose.models.Area || mongoose.model('Area', areaSchema);
