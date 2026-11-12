// server/geo/models/Room.js — Module 2 (Geospatial engine), v6 ("Room Persistence", spec Week 4)
// One saved office layout per floor: the Tiled map, its desks and its areas, with a version number.
// CONTRACTS.md section 9 (`rooms`).
//
// Example document:
//   { _id: 'floor-1', floorId: 'floor-1', name: 'Floor 1', version: 3, source: 'uploaded',
//     mapHash: '9f2c…', map: { …Tiled JSON… }, desks: [ … ], areas: [ … ], updatedAt: … }
// source = 'generated' (made by server/scripts/build-office-map.js, stored at start-up) or
//          'uploaded' (the admin uploaded a Tiled JSON on the admin page).

import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // the room id = the floor id
    floorId: { type: String, required: true },
    name: { type: String, required: true },
    map: { type: mongoose.Schema.Types.Mixed, required: true }, // the Tiled JSON (about 150 KB)
    desks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    areas: { type: [mongoose.Schema.Types.Mixed], default: [] },
    version: { type: Number, required: true, min: 1 },
    source: { type: String, enum: ['generated', 'uploaded'], required: true },
    mapHash: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false, timestamps: false, collection: 'rooms', versionKey: false, minimize: false },
);

export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
