// server/office/models.js — Person 1
// The four MongoDB collections of the Infotact office (CONTRACTS.md v5, section 9).
// A Mongoose "model" describes what one document looks like and gives us functions to read and
// write that collection. Our ids are readable text we choose (e.g. 'dept-engineering', 'emp-riya'),
// not MongoDB's random ObjectIds, so the seed can be run twice without making duplicates.
//
// Example documents:
//   departments  { _id: 'dept-engineering', name: 'Engineering', color: '#2f80ed', floorId: 'floor-1',
//                  wingId: 'A', size: 8, deskIds: ['A-01', …, 'A-08'] }
//   employees    { _id: 'emp-riya', email: 'riya@infotact.demo', name: 'Riya Sharma', role: 'lead',
//                  departmentId: 'dept-engineering', floorId: 'floor-1', deskId: 'A-01', hotDesk: false, createdAt }
//   floors       { _id: 'floor-1', name: 'Floor 1', tier: 1 }
//   alerts       { _id: 'alert-…', type: 'floor-full', message: 'Floor 1 is full …', createdAt, resolved: false }

import mongoose from 'mongoose';
import { ALERT_TYPES, ROLES } from '../../shared/constants.js';

const departmentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    floorId: { type: String, required: true },
    wingId: { type: String, default: null }, // the wing most of its block is in (for the tables)
    size: { type: Number, required: true, min: 0 }, // desks the admin wants reserved
    deskIds: { type: [String], default: [] }, // the reserved block
  },
  { collection: 'departments', versionKey: false },
);

const employeeSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    // unique + lowercase: "Riya@Infotact.demo" and "riya@infotact.demo" are the same person.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), required: true },
    departmentId: { type: String, required: true },
    floorId: { type: String, required: true },
    deskId: { type: String, default: null }, // a desk ('A-07') or a hot desk ('H-02'), or null
    hotDesk: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'employees', versionKey: false },
);

const floorSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // also the Socket.io room id of the floor
    name: { type: String, required: true },
    tier: { type: Number, default: 1 }, // open wings: 1 = A … 4 = A–D. Only grows.
  },
  { collection: 'floors', versionKey: false },
);

const alertSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, enum: Object.values(ALERT_TYPES), required: true },
    message: { type: String, required: true },
    floorId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
  },
  { collection: 'alerts', versionKey: false },
);

// `mongoose.models.X ||` reuses a model if this file is loaded twice (e.g. by a test and the seed).
export const Department = mongoose.models.Department || mongoose.model('Department', departmentSchema);
export const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
export const Floor = mongoose.models.Floor || mongoose.model('Floor', floorSchema);
export const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
