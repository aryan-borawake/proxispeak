// server/office/rebalance.js — Person 1
// Rebalancing: the admin moves whole departments to another floor (usually a new "Floor 2" when
// Floor 1 is full). A pure function, like desks.js: data in, new data out, nothing saved here.
//
// For every department that moves:
//   1. its people stand up from their Floor 1 desks (the desks become free), its Floor 1 block is
//      released;
//   2. on the new floor it reserves a block of max(size, number of people) neighbouring desks;
//   3. every person gets a desk there by the normal desk rule (chooseDesk).
// Then, on every floor that people LEFT, the hot-deskers who stayed get a real desk if one is now
// free (again by chooseDesk), so "hot desks are cleared where possible".
//
// Example: Floor 1 has 100 desks taken and 3 Marketing hot-deskers. The admin moves Engineering
// (30 people) to Floor 2. Engineering gets B-… desks on Floor 2; 30 desks free up on Floor 1; the
// 3 hot-deskers get real desks next to (or near) their Marketing block.

import { chooseDesk, reserveBlock } from './desks.js';

/**
 * @param {{ desks: object[], hotDesks: object[], departments: object[], employees: object[],
 *           moves: Array<{ departmentId: string, floorId: string }> }} input — ALL floors' data
 * @returns {{ departments: object[], employees: object[],
 *             moved: Array<{ employeeId: string, fromFloorId: string, toFloorId: string }>,
 *             reseated: string[] }}  reseated: employees who changed desk but not floor
 */
export function planRebalance({ desks, hotDesks, departments, employees, moves }) {
  // Work on copies, so the caller's data is never changed by accident.
  let departmentsOut = departments.map((d) => ({ ...d, deskIds: [...(d.deskIds || [])] }));
  let employeesOut = employees.map((e) => ({ ...e }));
  const moved = [];
  const reseated = [];
  const floorsLeft = new Set();

  const onFloor = (list, floorId) => list.filter((item) => item.floorId === floorId);

  for (const { departmentId, floorId: targetFloorId } of moves) {
    const department = departmentsOut.find((d) => d._id === departmentId);
    if (!department || department.floorId === targetFloorId) continue;
    const fromFloorId = department.floorId;
    floorsLeft.add(fromFloorId);

    // 1. Stand up and release the old block.
    const members = employeesOut.filter((e) => e.departmentId === departmentId);
    for (const member of members) {
      member.deskId = null;
      member.hotDesk = false;
      member.floorId = targetFloorId;
    }
    department.deskIds = [];
    department.floorId = targetFloorId;

    // 2. A new block on the target floor. "Other" = everyone already there (not this department).
    const targetDepartments = onFloor(departmentsOut, targetFloorId).filter((d) => d._id !== departmentId);
    const seatedThere = onFloor(employeesOut, targetFloorId).filter((e) => e.departmentId !== departmentId);
    department.deskIds = reserveBlock({
      desks,
      departments: targetDepartments,
      employees: seatedThere,
      size: Math.max(department.size, members.length),
    });
    department.wingId = department.deskIds.length > 0 ? department.deskIds[0].split('-')[0] : null;

    // 3. Seat everyone by the desk rule, one after another.
    for (const member of members) {
      const answer = chooseDesk({
        desks,
        hotDesks,
        departments: onFloor(departmentsOut, targetFloorId),
        employees: onFloor(employeesOut, targetFloorId).filter((e) => e.deskId),
        departmentId,
      });
      department.deskIds = answer.departmentDeskIds;
      member.deskId = answer.deskId;
      member.hotDesk = answer.hotDesk;
      moved.push({ employeeId: member._id, fromFloorId, toFloorId: targetFloorId });
    }
  }

  // 4. Give the remaining hot-deskers of the floors people left a real desk, where one is free.
  for (const floorId of floorsLeft) {
    const hotDeskers = onFloor(employeesOut, floorId).filter((e) => e.hotDesk);
    for (const person of hotDeskers) {
      const others = onFloor(employeesOut, floorId).filter((e) => e._id !== person._id && e.deskId);
      const answer = chooseDesk({ desks, hotDesks: [], departments: onFloor(departmentsOut, floorId), employees: others, departmentId: person.departmentId });
      if (answer.deskId && !answer.hotDesk) {
        const department = departmentsOut.find((d) => d._id === person.departmentId);
        if (department) department.deskIds = answer.departmentDeskIds;
        person.deskId = answer.deskId;
        person.hotDesk = false;
        reseated.push(person._id);
      }
    }
  }

  departmentsOut = departmentsOut.map((d) => ({ ...d }));
  employeesOut = employeesOut.map((e) => ({ ...e }));
  return { departments: departmentsOut, employees: employeesOut, moved, reseated };
}
