// server/office/store.js — Person 1
// The office's data, kept in the server's MEMORY and saved to MongoDB after every change.
//
// Why memory first? The signaling server asks "who is this token's employee? which wing is closed?"
// on joins and moves. Asking MongoDB every time would be slow, so we keep the (small) directory in
// Maps and only WRITE to MongoDB when something changes (an admin action), never per move.
// If MongoDB is not available (no MONGODB_URI), the store still works from the demo directory, in
// memory only, so the demo never breaks; changes are then lost on restart (logged at start-up).
//
// When something changes, the store emits a 'change' event (officeEvents) so the signaling server
// can tell the browsers on that floor (EVENTS.OFFICE_UPDATE) and move people between floors.

import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { ALERT_TYPES, DEFAULT_FLOOR_ID, ROLES, WING_IDS } from '../../shared/constants.js';
import { Alert, Department, Employee, Floor } from './models.js';
import { chooseDesk, DESK_RESULTS, reserveBlock, resizeBlock } from './desks.js';
import { computeFloorTier, openWingsForTier, tierOfWing } from './tiers.js';
import { planRebalance } from './rebalance.js';
import { buildSeedDirectory, employeeIdFor } from './seedData.js';
import { seedDatabase } from './seedDb.js';
import { deskById, layout } from './layout.js';

// 'change' events: { floorIds: string[], moved: [{ employeeId, fromFloorId, toFloorId }], employeeIds: string[] }
export const officeEvents = new EventEmitter();

const state = {
  floors: new Map(), // id → { _id, name, tier }
  departments: new Map(), // id → { _id, name, color, floorId, wingId, size, deskIds }
  employees: new Map(), // id → { _id, email, name, role, departmentId, floorId, deskId, hotDesk, createdAt }
  alerts: new Map(), // id → { _id, type, message, floorId, createdAt, resolved }
};

// true when changes are saved to MongoDB.
let savingToDatabase = false;

/** A short random id with a readable prefix, e.g. 'alert-3f9a1c2b'. */
function newId(prefix) {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

/** Copy documents into a Map by _id. */
function fillMap(map, documents) {
  map.clear();
  for (const document of documents) map.set(document._id, { ...document });
}

/**
 * Load the office at start-up. Uses MongoDB if mongoose is connected (server/index.js connects it
 * for the geo engine); seeds the demo directory into it if it has no employees yet.
 * Otherwise uses the demo directory in memory.
 */
export async function loadOffice() {
  if (mongoose.connection.readyState === 1) {
    try {
      if ((await Employee.estimatedDocumentCount()) === 0) {
        const { inserted } = await seedDatabase();
        console.log(`[office] the database had no employees: seeded the demo directory (${inserted.employees} people)`);
      }
      const [floors, departments, employees, alerts] = await Promise.all([
        Floor.find().lean(),
        Department.find().lean(),
        Employee.find().lean(),
        Alert.find().lean(),
      ]);
      fillMap(state.floors, floors);
      fillMap(state.departments, departments);
      fillMap(state.employees, employees);
      fillMap(state.alerts, alerts);
      savingToDatabase = true;
      console.log(`[office] loaded from MongoDB: ${employees.length} employees, ${departments.length} departments, ${floors.length} floor(s)`);
      recomputeTiers({ quiet: true });
      return;
    } catch (error) {
      console.warn(`[office] could not load from MongoDB (${error.message}); using the demo directory in memory`);
    }
  }
  const { floors, departments, employees } = buildSeedDirectory();
  fillMap(state.floors, floors);
  fillMap(state.departments, departments);
  fillMap(state.employees, employees);
  state.alerts.clear();
  savingToDatabase = false;
  recomputeTiers({ quiet: true });
  console.log(`[office] using the demo directory IN MEMORY (${employees.length} employees). Changes are lost on restart; set MONGODB_URI to keep them.`);
}

// ---------------------------------------------------------------- reading

export function getEmployee(id) {
  return state.employees.get(id) || null;
}
export function getDepartment(id) {
  return state.departments.get(id) || null;
}
export function getFloor(id) {
  return state.floors.get(id) || null;
}
export function findEmployeeByEmail(email) {
  const wanted = String(email || '').trim().toLowerCase();
  for (const employee of state.employees.values()) {
    if (employee.email === wanted) return employee;
  }
  return null;
}
export function listEmployees() {
  return [...state.employees.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function listDepartments() {
  return [...state.departments.values()];
}
export function listFloors() {
  return [...state.floors.values()].sort((a, b) => a._id.localeCompare(b._id, undefined, { numeric: true }));
}
export function listAlerts() {
  return [...state.alerts.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

const departmentsOn = (floorId) => listDepartments().filter((d) => d.floorId === floorId);
const employeesOn = (floorId) => [...state.employees.values()].filter((e) => e.floorId === floorId);

/** The wings open on a floor right now, e.g. ['A', 'B']. */
export function openWingsOf(floorId) {
  const floor = getFloor(floorId);
  return openWingsForTier(floor ? floor.tier : 1);
}

/** Is this wing closed on this floor? Used by the signaling server to refuse moves into it. */
export function isWingClosed(floorId, wingId) {
  return wingId !== null && !openWingsOf(floorId).includes(wingId);
}

/** A department as the browsers see it. */
function publicDepartment(department) {
  return { id: department._id, name: department.name, color: department.color, wingId: department.wingId, deskIds: [...department.deskIds] };
}

/**
 * Everything a browser on this floor needs to draw it: tier, open wings, department blocks, which
 * hot desks are in use. The payload of EVENTS.OFFICE_UPDATE, and `office` in WORLD_INIT.
 * Example: { floorId: 'floor-1', name: 'Floor 1', tier: 1, openWings: ['A'], headcount: 17,
 *            departments: [{ id: 'dept-hr', name: 'HR', color: '#eb5757', wingId: 'A', deskIds: [...] }],
 *            hotDeskIds: [] }
 */
export function floorSnapshot(floorId) {
  const floor = getFloor(floorId);
  const people = employeesOn(floorId);
  return {
    floorId,
    name: floor ? floor.name : floorId,
    tier: floor ? floor.tier : 1,
    openWings: openWingsOf(floorId),
    headcount: people.length,
    departments: departmentsOn(floorId).map(publicDepartment),
    hotDeskIds: people.filter((e) => e.hotDesk && e.deskId).map((e) => e.deskId),
    floors: listFloors().map((f) => ({ id: f._id, name: f.name })),
  };
}

/**
 * Who an employee is, for the browser (GET /api/me, the lobby, WORLD_INIT `profile`).
 * desk is the avatar position of their desk ({ x, y }), or null.
 */
export function profileOf(employee) {
  const department = getDepartment(employee.departmentId);
  const desk = employee.deskId ? deskById(employee.deskId) : null;
  const floor = getFloor(employee.floorId);
  return {
    employeeId: employee._id,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    department: department ? { id: department._id, name: department.name, color: department.color } : null,
    floorId: employee.floorId,
    floorName: floor ? floor.name : employee.floorId,
    deskId: employee.deskId,
    hotDesk: employee.hotDesk,
    desk: desk ? { x: desk.x, y: desk.y } : null,
  };
}

// ---------------------------------------------------------------- saving and telling

const changed = { floors: new Set(), departments: new Set(), employees: new Set(), alerts: new Set() };

/** Save every document marked as changed (one bulkWrite per collection), if we use MongoDB. */
async function flush() {
  const jobs = [
    [Floor, state.floors, changed.floors],
    [Department, state.departments, changed.departments],
    [Employee, state.employees, changed.employees],
    [Alert, state.alerts, changed.alerts],
  ];
  if (!savingToDatabase) {
    for (const [, , ids] of jobs) ids.clear();
    return;
  }
  await Promise.all(
    jobs.map(async ([Model, map, ids]) => {
      const operations = [...ids].filter((id) => map.has(id)).map((id) => ({ replaceOne: { filter: { _id: id }, replacement: map.get(id), upsert: true } }));
      ids.clear();
      if (operations.length > 0) await Model.bulkWrite(operations, { ordered: false });
    }),
  );
}

function addAlert(type, message, floorId) {
  const alert = { _id: newId('alert'), type, message, floorId, createdAt: new Date(), resolved: false };
  state.alerts.set(alert._id, alert);
  changed.alerts.add(alert._id);
  console.log(`[office] alert: ${message}`);
  return alert;
}

/**
 * Work out every floor's tier again (it only grows). If a floor grew, add an alert and mark it,
 * so the 'change' event tells its browsers the wing opened.
 * @returns {string[]} the floors whose tier changed
 */
function recomputeTiers({ quiet = false } = {}) {
  const grown = [];
  for (const floor of state.floors.values()) {
    const people = employeesOn(floor._id);
    const usedWingIds = new Set();
    for (const department of departmentsOn(floor._id)) {
      for (const deskId of department.deskIds) usedWingIds.add(deskId.split('-')[0]);
    }
    for (const person of people) {
      if (person.deskId && !person.hotDesk) usedWingIds.add(person.deskId.split('-')[0]);
    }
    const tier = computeFloorTier({ previousTier: floor.tier || 1, headcount: people.length, usedWingIds: [...usedWingIds].filter((id) => WING_IDS.includes(id)) });
    if (tier !== floor.tier) {
      const opened = WING_IDS.filter((id) => tierOfWing(id) > (floor.tier || 1) && tierOfWing(id) <= tier);
      floor.tier = tier;
      changed.floors.add(floor._id);
      grown.push(floor._id);
      if (!quiet) addAlert(ALERT_TYPES.WING_OPENED, `${floor.name} grew to tier ${tier}: wing ${opened.join(' + ')} is now open.`, floor._id);
    }
  }
  return grown;
}

/** After every change: tiers, save, and tell the signaling server. */
async function finishChange({ floorIds = [], moved = [], employeeIds = [] }) {
  const grown = recomputeTiers();
  await flush();
  officeEvents.emit('change', { floorIds: [...new Set([...floorIds, ...grown])], moved, employeeIds });
}

// ---------------------------------------------------------------- changing (admin actions)

/** A friendly error with an HTTP status, e.g. 404 "No department with id …". */
export class OfficeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Seat one person by the desk rule and add an alert if they got a hot desk (or nothing).
 * Changes `employee` and its department in the state.
 */
function seatByRule(employee) {
  const answer = chooseDesk({
    desks: layout.desks,
    hotDesks: layout.hotDesks,
    departments: departmentsOn(employee.floorId),
    employees: employeesOn(employee.floorId).filter((e) => e._id !== employee._id && e.deskId),
    departmentId: employee.departmentId,
  });
  const department = getDepartment(employee.departmentId);
  department.deskIds = answer.departmentDeskIds;
  if (!department.wingId && answer.departmentDeskIds.length > 0) department.wingId = answer.departmentDeskIds[0].split('-')[0];
  changed.departments.add(department._id);
  employee.deskId = answer.deskId;
  employee.hotDesk = answer.kind === DESK_RESULTS.HOT_DESK || answer.kind === DESK_RESULTS.FLOOR_FULL;
  changed.employees.add(employee._id);

  if (answer.kind === DESK_RESULTS.HOT_DESK || answer.kind === DESK_RESULTS.FLOOR_FULL) {
    raiseFloorFullAlert(employee, department, answer);
  }
  return answer;
}

/**
 * One open "Floor N is full" alert per floor (not one per person): the first overflow hire creates
 * it, later ones update its text and count.
 * Example: "Floor 1 is full: 10 people are on hot desks (latest: Isha Kapoor, Marketing, H-10). …"
 */
function raiseFloorFullAlert(employee, department, answer) {
  const floorName = getFloor(employee.floorId)?.name || employee.floorId;
  const hotDeskers = employeesOn(employee.floorId).filter((e) => e.hotDesk).length;
  const latest = answer.deskId ? `${employee.name}, ${department.name}, ${answer.deskId}` : `${employee.name}, ${department.name}, no desk at all`;
  const message =
    `${floorName} is full: ${hotDeskers} ${hotDeskers === 1 ? 'person is' : 'people are'} on hot desks (latest: ${latest}). ` +
    'Add a floor or move a department to rebalance.';
  const open = [...state.alerts.values()].find((a) => a.type === ALERT_TYPES.FLOOR_FULL && a.floorId === employee.floorId && !a.resolved);
  if (open) {
    open.message = message;
    open.createdAt = new Date();
    changed.alerts.add(open._id);
    return;
  }
  addAlert(ALERT_TYPES.FLOOR_FULL, message, employee.floorId);
}

/**
 * Add one employee (admin "Add employee" form, or a sample hire).
 * @param {{ name: string, email: string, role?: string, departmentId: string }} input
 */
export async function addEmployee({ name, email, role = ROLES.EMPLOYEE, departmentId }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanName === '') throw new OfficeError(400, 'A new employee needs a name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) throw new OfficeError(400, `"${email}" is not an email address.`);
  if (!Object.values(ROLES).includes(role)) throw new OfficeError(400, `Role must be one of ${Object.values(ROLES).join(', ')}.`);
  if (findEmployeeByEmail(cleanEmail)) throw new OfficeError(409, `${cleanEmail} is already in the directory.`);
  const department = getDepartment(departmentId);
  if (!department) throw new OfficeError(404, `No department with id "${departmentId}".`);

  const employee = await addEmployeeQuietly({ name: cleanName, email: cleanEmail, role, department });
  await finishChange({ floorIds: [employee.floorId], employeeIds: [employee._id] });
  return { employee, profile: profileOf(employee) };
}

async function addEmployeeQuietly({ name, email, role, department }) {
  let id = employeeIdFor(email);
  while (state.employees.has(id)) id = `${id}-${randomBytes(2).toString('hex')}`;
  const employee = { _id: id, email, name, role, departmentId: department._id, floorId: department.floorId, deskId: null, hotDesk: false, createdAt: new Date() };
  state.employees.set(id, employee);
  seatByRule(employee);
  return employee;
}

const SAMPLE_FIRST = ['Aarav', 'Diya', 'Ishaan', 'Kiara', 'Vivaan', 'Myra', 'Reyansh', 'Anika', 'Advik', 'Saanvi', 'Krish', 'Tara', 'Yash', 'Nisha', 'Om', 'Pooja', 'Rahul', 'Zara', 'Nikhil', 'Ira'];
const SAMPLE_LAST = ['Bose', 'Chopra', 'Desai', 'Fernandes', 'Ghosh', 'Hegde', 'Jain', 'Kulkarni', 'Lal', 'Mishra', 'Naidu', 'Pillai', 'Saxena', 'Thakur', 'Varma'];

/** "Add 10 sample employees": random names into one department, seated one by one. */
export async function addSampleEmployees({ departmentId, count = 10 }) {
  const department = getDepartment(departmentId);
  if (!department) throw new OfficeError(404, `No department with id "${departmentId}".`);
  const howMany = Math.max(1, Math.min(50, Number(count) || 10));
  const added = [];
  for (let i = 0; i < howMany; i += 1) {
    const first = SAMPLE_FIRST[Math.floor(Math.random() * SAMPLE_FIRST.length)];
    const last = SAMPLE_LAST[Math.floor(Math.random() * SAMPLE_LAST.length)];
    let email = `${first}.${last}`.toLowerCase();
    let n = 2;
    while (findEmployeeByEmail(`${email}@infotact.demo`)) {
      email = `${first}.${last}${n}`.toLowerCase();
      n += 1;
    }
    added.push(await addEmployeeQuietly({ name: `${first} ${last}`, email: `${email}@infotact.demo`, role: ROLES.EMPLOYEE, department }));
  }
  await finishChange({ floorIds: [department.floorId], employeeIds: added.map((e) => e._id) });
  return { added: added.map(profileOf) };
}

/** Add a department with a block of `size` neighbouring desks on a floor. */
export async function addDepartment({ name, color, size, floorId = DEFAULT_FLOOR_ID }) {
  const cleanName = String(name || '').trim();
  if (cleanName === '') throw new OfficeError(400, 'A department needs a name.');
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) throw new OfficeError(400, 'Colour must look like #2f80ed.');
  const wantedSize = Math.round(Number(size));
  if (!Number.isFinite(wantedSize) || wantedSize < 1 || wantedSize > 100) throw new OfficeError(400, 'Size must be a number of desks from 1 to 100.');
  if (!getFloor(floorId)) throw new OfficeError(404, `No floor with id "${floorId}".`);
  if (listDepartments().some((d) => d.name.toLowerCase() === cleanName.toLowerCase())) throw new OfficeError(409, `There is already a department called ${cleanName}.`);

  let id = `dept-${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  while (state.departments.has(id)) id = `${id}-${randomBytes(2).toString('hex')}`;
  const deskIds = reserveBlock({ desks: layout.desks, departments: departmentsOn(floorId), employees: employeesOn(floorId), size: wantedSize });
  const department = { _id: id, name: cleanName, color: color.toLowerCase(), floorId, wingId: deskIds.length ? deskIds[0].split('-')[0] : null, size: wantedSize, deskIds };
  state.departments.set(id, department);
  changed.departments.add(id);
  await finishChange({ floorIds: [floorId] });
  return department;
}

/**
 * Rename, recolour or resize a department. Resizing re-runs the desk rule for THIS department only:
 * its block grows or shrinks, and its hot-deskers get a desk in the block if one is now free.
 */
export async function updateDepartment(id, { name, color, size }) {
  const department = getDepartment(id);
  if (!department) throw new OfficeError(404, `No department with id "${id}".`);
  const employeeIds = [];
  if (name !== undefined) {
    const cleanName = String(name).trim();
    if (cleanName === '') throw new OfficeError(400, 'A department needs a name.');
    department.name = cleanName;
  }
  if (color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) throw new OfficeError(400, 'Colour must look like #2f80ed.');
    department.color = color.toLowerCase();
  }
  if (size !== undefined) {
    const wantedSize = Math.round(Number(size));
    if (!Number.isFinite(wantedSize) || wantedSize < 0 || wantedSize > 100) throw new OfficeError(400, 'Size must be a number of desks from 0 to 100.');
    department.size = wantedSize;
    department.deskIds = resizeBlock({ desks: layout.desks, departments: departmentsOn(department.floorId), employees: employeesOn(department.floorId), departmentId: id, newSize: wantedSize });
    department.wingId = department.deskIds.length ? department.deskIds[0].split('-')[0] : department.wingId;
    // Hot-deskers of this department: a free desk in the block now?
    for (const person of employeesOn(department.floorId).filter((e) => e.departmentId === id && e.hotDesk)) {
      const taken = new Set(employeesOn(department.floorId).filter((e) => e.deskId && !e.hotDesk).map((e) => e.deskId));
      const free = department.deskIds.find((deskId) => !taken.has(deskId));
      if (free) {
        person.deskId = free;
        person.hotDesk = false;
        changed.employees.add(person._id);
        employeeIds.push(person._id);
      }
    }
  }
  changed.departments.add(id);
  await finishChange({ floorIds: [department.floorId], employeeIds });
  return department;
}

/** Add the next floor ("Floor 2", …). It starts empty at tier 1. */
export async function addFloor() {
  const number = state.floors.size + 1;
  let id = `floor-${number}`;
  while (state.floors.has(id)) id = `floor-${Number(id.split('-')[1]) + 1}`;
  const floor = { _id: id, name: `Floor ${id.split('-')[1]}`, tier: 1 };
  state.floors.set(id, floor);
  changed.floors.add(id);
  addAlert(ALERT_TYPES.FLOOR_ADDED, `${floor.name} was added. Move departments to it from the Floors page.`, id);
  await finishChange({ floorIds: listFloors().map((f) => f._id) });
  return floor;
}

/**
 * Move departments between floors ("Apply" in the admin's floor dialog). See rebalance.js.
 * @param {Array<{ departmentId: string, floorId: string }>} moves
 */
export async function applyFloorMoves(moves) {
  if (!Array.isArray(moves)) throw new OfficeError(400, 'Send { moves: [{ departmentId, floorId }] }.');
  for (const move of moves) {
    if (!getDepartment(move?.departmentId)) throw new OfficeError(404, `No department with id "${move?.departmentId}".`);
    if (!getFloor(move?.floorId)) throw new OfficeError(404, `No floor with id "${move?.floorId}".`);
  }
  const before = new Map(listDepartments().map((d) => [d._id, d.floorId]));
  const plan = planRebalance({ desks: layout.desks, hotDesks: layout.hotDesks, departments: listDepartments(), employees: [...state.employees.values()], moves });
  for (const department of plan.departments) {
    state.departments.set(department._id, department);
    changed.departments.add(department._id);
  }
  for (const employee of plan.employees) {
    const old = state.employees.get(employee._id);
    if (old.deskId !== employee.deskId || old.floorId !== employee.floorId || old.hotDesk !== employee.hotDesk) changed.employees.add(employee._id);
    state.employees.set(employee._id, employee);
  }
  // A floor whose hot desks are all cleared no longer needs its "full" alerts.
  for (const floor of state.floors.values()) {
    if (!employeesOn(floor._id).some((e) => e.hotDesk)) {
      for (const alert of state.alerts.values()) {
        if (alert.floorId === floor._id && alert.type === ALERT_TYPES.FLOOR_FULL && !alert.resolved) {
          alert.resolved = true;
          changed.alerts.add(alert._id);
        }
      }
    }
  }
  const floorIds = new Set();
  for (const move of moves) {
    floorIds.add(move.floorId);
    floorIds.add(before.get(move.departmentId));
  }
  await finishChange({ floorIds: [...floorIds], moved: plan.moved, employeeIds: [...plan.reseated] });
  return { moved: plan.moved.length, reseated: plan.reseated.length };
}

export async function resolveAlert(id) {
  const alert = state.alerts.get(id);
  if (!alert) throw new OfficeError(404, `No alert with id "${id}".`);
  alert.resolved = true;
  changed.alerts.add(id);
  await flush();
  return alert;
}

/** Numbers for the admin overview. `online` is a Set of employee ids that are in the office now. */
export function overview(online = new Set()) {
  const floors = listFloors().map((floor) => {
    const people = employeesOn(floor._id);
    return {
      id: floor._id,
      name: floor.name,
      tier: floor.tier,
      openWings: openWingsOf(floor._id),
      headcount: people.length,
      desksUsed: people.filter((e) => e.deskId && !e.hotDesk).length,
      capacity: openWingsOf(floor._id).length * (layout.desks.length / WING_IDS.length),
      hotDesksUsed: people.filter((e) => e.hotDesk).length,
      online: people.filter((e) => online.has(e._id)).length,
    };
  });
  return {
    headcount: state.employees.size,
    desksUsed: floors.reduce((sum, f) => sum + f.desksUsed, 0),
    capacity: floors.reduce((sum, f) => sum + f.capacity, 0),
    hotDesksUsed: floors.reduce((sum, f) => sum + f.hotDesksUsed, 0),
    openAlerts: listAlerts().filter((a) => !a.resolved).length,
    online: online.size,
    floors,
  };
}
