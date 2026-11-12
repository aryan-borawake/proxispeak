// server/office/desks.js — Person 1
// The desk rule: which desk does a person get? Pure functions: they only look at their inputs
// (the floor's desks, its departments and its employees) and return an answer. No database, no
// network, so server/scripts/office-rules-test.js can test every case with made-up data.
//
// Words:
//   desk        one of the 100 desks of a floor, e.g. { id: 'A-07', wingId: 'A', index: 6 }.
//               Desks in a wing are numbered in a "snake", so A-07 sits right next to A-06 and A-08.
//   block       the run of neighbouring desks a department reserved, e.g. Engineering: A-01 … A-08.
//               department.deskIds is its block; department.size is how many desks the admin wants.
//   hot desk    a shared desk in the hot-desk room (H-01 … H-14), for overflow hires.
//
// The rule for one new person in department D (chooseDesk), tried in this order:
//   1. a free desk in D's own block                                    → 'own-block'
//   2. grow D's block into the free desk right next to it, same wing    → 'grown'
//   3. a free, unreserved desk anywhere else on the floor (wings A → D) → 'elsewhere'
//      (this may be in a wing that is still closed: the floor's tier then grows and it opens)
//   4. a free hot desk (the person gets hotDesk: true; the admin gets an alert)  → 'hot-desk'
//   5. nothing left at all                                              → 'floor-full'

import { WING_IDS } from '../../shared/constants.js';

// The possible answers of chooseDesk.
export const DESK_RESULTS = Object.freeze({
  OWN_BLOCK: 'own-block',
  GROWN: 'grown',
  ELSEWHERE: 'elsewhere',
  HOT_DESK: 'hot-desk',
  FLOOR_FULL: 'floor-full',
});

/**
 * Who reserved and who sits at each desk.
 * @returns {{ reservedBy: Map<string, string>, occupiedBy: Map<string, string> }}
 *   reservedBy: deskId → departmentId;  occupiedBy: deskId (normal or hot) → employeeId
 */
export function describeFloor({ departments, employees }) {
  const reservedBy = new Map();
  for (const department of departments) {
    for (const deskId of department.deskIds || []) reservedBy.set(deskId, department._id);
  }
  const occupiedBy = new Map();
  for (const employee of employees) {
    if (employee.deskId) occupiedBy.set(employee.deskId, employee._id);
  }
  return { reservedBy, occupiedBy };
}

/** The desks of one wing in snake order (index 0 … 24). */
function desksOfWing(desks, wingId) {
  return desks.filter((desk) => desk.wingId === wingId).sort((a, b) => a.index - b.index);
}

/**
 * Find `size` neighbouring desks that nobody reserved, for a new department block.
 * First choice: one unbroken run in a single wing (wings in opening order A → D).
 * If no wing has such a run, the free desks are taken in order (the block is then split).
 * Example: wing A desks 1–20 reserved, size 8 → B-01 … B-08.
 *
 * @param {{ desks: object[], departments: object[], employees: object[], size: number }} input
 * @returns {string[]} desk ids; fewer than `size` only if the floor has no more free desks
 */
export function reserveBlock({ desks, departments, employees, size }) {
  if (size <= 0) return [];
  const { reservedBy, occupiedBy } = describeFloor({ departments, employees });
  const isFree = (desk) => !reservedBy.has(desk.id) && !occupiedBy.has(desk.id);

  for (const wingId of WING_IDS) {
    const wingDesks = desksOfWing(desks, wingId);
    let run = [];
    for (const desk of wingDesks) {
      run = isFree(desk) ? [...run, desk.id] : [];
      if (run.length === size) return run;
    }
  }

  const scattered = [];
  for (const wingId of WING_IDS) {
    for (const desk of desksOfWing(desks, wingId)) {
      if (isFree(desk) && scattered.length < size) scattered.push(desk.id);
    }
  }
  return scattered;
}

/**
 * The free desk right next to a department's block (same wing): first the desk after the block's
 * last desk, then the one before its first desk. null if both are taken or reserved.
 */
function findNeighbourDesk({ desks, department, reservedBy, occupiedBy }) {
  const byId = new Map(desks.map((desk) => [desk.id, desk]));
  const blockDesks = (department.deskIds || []).map((id) => byId.get(id)).filter(Boolean);
  const wingIds = [...new Set(blockDesks.map((desk) => desk.wingId))];

  for (const wingId of wingIds) {
    const indexes = blockDesks.filter((desk) => desk.wingId === wingId).map((desk) => desk.index);
    const candidates = [Math.max(...indexes) + 1, Math.min(...indexes) - 1];
    for (const index of candidates) {
      const desk = desks.find((d) => d.wingId === wingId && d.index === index);
      if (desk && !reservedBy.has(desk.id) && !occupiedBy.has(desk.id)) return desk.id;
    }
  }
  return null;
}

/** The first free, unreserved desk on the floor, wings in opening order. null if there is none. */
function findAnyFreeDesk({ desks, reservedBy, occupiedBy }) {
  for (const wingId of WING_IDS) {
    for (const desk of desksOfWing(desks, wingId)) {
      if (!reservedBy.has(desk.id) && !occupiedBy.has(desk.id)) return desk.id;
    }
  }
  return null;
}

/**
 * The desk rule for one new person (see the top of this file).
 *
 * Example: Engineering has block A-01 … A-08 and 8 people already → A-09 is free and unreserved
 *          → { kind: 'grown', deskId: 'A-09', hotDesk: false, departmentDeskIds: [A-01 … A-09] }
 *
 * @param {{ desks: object[], hotDesks: object[], departments: object[], employees: object[],
 *           departmentId: string }} input — departments and employees of THIS floor only
 * @returns {{ kind: string, deskId: string | null, hotDesk: boolean, departmentDeskIds: string[] }}
 *   departmentDeskIds is the department's block afterwards (it changes for 'grown' and 'elsewhere')
 */
export function chooseDesk({ desks, hotDesks, departments, employees, departmentId }) {
  const department = departments.find((d) => d._id === departmentId);
  const blockIds = department ? [...(department.deskIds || [])] : [];
  const { reservedBy, occupiedBy } = describeFloor({ departments, employees });

  // 1. A free desk in the department's own block.
  const ownFree = blockIds.find((deskId) => !occupiedBy.has(deskId));
  if (ownFree) {
    return { kind: DESK_RESULTS.OWN_BLOCK, deskId: ownFree, hotDesk: false, departmentDeskIds: blockIds };
  }

  // 2. Grow the block into the desk right next to it.
  if (department && blockIds.length > 0) {
    const neighbour = findNeighbourDesk({ desks, department, reservedBy, occupiedBy });
    if (neighbour) {
      return { kind: DESK_RESULTS.GROWN, deskId: neighbour, hotDesk: false, departmentDeskIds: [...blockIds, neighbour] };
    }
  }

  // 3. Any free desk elsewhere on the floor (it becomes part of the department's block).
  const elsewhere = findAnyFreeDesk({ desks, reservedBy, occupiedBy });
  if (elsewhere) {
    return { kind: DESK_RESULTS.ELSEWHERE, deskId: elsewhere, hotDesk: false, departmentDeskIds: [...blockIds, elsewhere] };
  }

  // 4. A hot desk.
  const freeHotDesk = hotDesks.find((hotDesk) => !occupiedBy.has(hotDesk.id));
  if (freeHotDesk) {
    return { kind: DESK_RESULTS.HOT_DESK, deskId: freeHotDesk.id, hotDesk: true, departmentDeskIds: blockIds };
  }

  // 5. Nothing at all.
  return { kind: DESK_RESULTS.FLOOR_FULL, deskId: null, hotDesk: false, departmentDeskIds: blockIds };
}

/**
 * Change how many desks a department reserves (the admin resized it). Only this department changes.
 *   bigger:  grow the block next to itself first, then take free desks elsewhere;
 *   smaller: give back free desks from the end of the block, but never a desk someone sits at.
 * Example: block A-01 … A-05 with 3 people, newSize 3 → [A-01, A-02, A-03] if those are the occupied ones.
 *
 * @returns {string[]} the department's new block
 */
export function resizeBlock({ desks, departments, employees, departmentId, newSize }) {
  const department = departments.find((d) => d._id === departmentId);
  if (!department) return [];
  let blockIds = [...(department.deskIds || [])];
  const { occupiedBy } = describeFloor({ departments, employees });

  if (newSize < blockIds.length) {
    // Walk from the end of the block and drop free desks until it is small enough.
    const kept = [...blockIds];
    for (let i = kept.length - 1; i >= 0 && kept.length > newSize; i -= 1) {
      if (!occupiedBy.has(kept[i])) kept.splice(i, 1);
    }
    return kept;
  }

  while (blockIds.length < newSize) {
    const others = departments.map((d) => (d._id === departmentId ? { ...d, deskIds: blockIds } : d));
    const { reservedBy } = describeFloor({ departments: others, employees });
    const next =
      (blockIds.length > 0 && findNeighbourDesk({ desks, department: { deskIds: blockIds }, reservedBy, occupiedBy })) ||
      (blockIds.length === 0 ? reserveBlock({ desks, departments: others, employees, size: newSize })[0] : null) ||
      findAnyFreeDesk({ desks, reservedBy, occupiedBy });
    if (!next) break; // the floor is full: the block stays smaller than asked
    blockIds = [...blockIds, next];
  }
  return blockIds;
}
