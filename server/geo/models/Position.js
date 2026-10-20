// server/geo/models/Position.js — Person 2 (Module 2: Geospatial engine)
// Describes what a saved position looks like, and configures the 2d index.
// See CONTRACTS.md (Section 9: Database) and docs/briefs/module-2-geospatial.md.

import mongoose from 'mongoose';
import { WORLD_MAX_PX } from '../../../shared/constants.js';

const positionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    loc: {
      type: [Number],
      required: true,
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
        },
        message: 'loc must be an array of two numbers [x, y]',
      },
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false, // Tell Mongoose not to auto-generate ObjectId for _id
    timestamps: false,
    collection: 'positions',
  }
);

// 2D index for flat-plane Euclidean pixel coordinates within bounds [0, WORLD_MAX_PX (4096)].
// Notice: 2d index accepts bounds { min, max }. Do NOT replace with 2dsphere (which is for Earth lat/long).
positionSchema.index(
  { loc: '2d', roomId: 1 },
  { min: 0, max: WORLD_MAX_PX }
);

export const Position = mongoose.models.Position || mongoose.model('Position', positionSchema);
