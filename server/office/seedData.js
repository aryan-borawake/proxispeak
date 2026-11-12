// server/office/seedData.js — Person 1
// The Infotact DEMO directory: made-up people with @infotact.demo emails (not real addresses).
// In production this list would come from Infotact's HR system; here it lets anyone try the app.
//
// buildSeedDirectory() turns the lists below into complete documents: every department reserves a
// block of neighbouring desks in wing A (reserveBlock), and every person gets a desk by the normal
// desk rule (chooseDesk), exactly as if the admin had added them one by one.

import { DEFAULT_FLOOR_ID, ROLES } from '../../shared/constants.js';
import { chooseDesk, reserveBlock } from './desks.js';
import { layout } from './layout.js';

export const SEED_FLOORS = [{ _id: DEFAULT_FLOOR_ID, name: 'Floor 1', tier: 1 }];

// Sizes add up to 25, so the whole directory fits in wing A (tier 1), with a few free desks in each
// block for new hires. The admin can resize any department later.
export const SEED_DEPARTMENTS = [
  { _id: 'dept-engineering', name: 'Engineering', color: '#2f80ed', size: 8 },
  { _id: 'dept-design', name: 'Design', color: '#9b51e0', size: 4 },
  { _id: 'dept-marketing', name: 'Marketing', color: '#f2994a', size: 4 },
  { _id: 'dept-hr', name: 'HR', color: '#eb5757', size: 3 },
  { _id: 'dept-management', name: 'Management', color: '#27ae60', size: 6 },
];

// [first name, last name, role, department id]. The email is the first name @infotact.demo.
const PEOPLE = [
  ['Riya', 'Sharma', ROLES.LEAD, 'dept-engineering'],
  ['Arjun', 'Mehta', ROLES.EMPLOYEE, 'dept-engineering'],
  ['Neha', 'Iyer', ROLES.EMPLOYEE, 'dept-engineering'],
  ['Kabir', 'Singh', ROLES.EMPLOYEE, 'dept-engineering'],
  ['Sneha', 'Patil', ROLES.INTERN, 'dept-engineering'],
  ['Ananya', 'Rao', ROLES.LEAD, 'dept-design'],
  ['Vikram', 'Das', ROLES.EMPLOYEE, 'dept-design'],
  ['Meera', 'Nair', ROLES.INTERN, 'dept-design'],
  ['Rohan', 'Gupta', ROLES.LEAD, 'dept-marketing'],
  ['Isha', 'Kapoor', ROLES.EMPLOYEE, 'dept-marketing'],
  ['Dev', 'Malhotra', ROLES.EMPLOYEE, 'dept-marketing'],
  ['Priya', 'Menon', ROLES.LEAD, 'dept-hr'],
  ['Aditya', 'Joshi', ROLES.EMPLOYEE, 'dept-hr'],
  ['Sanjay', 'Verma', ROLES.DIRECTOR, 'dept-management'],
  ['Kavya', 'Reddy', ROLES.DIRECTOR, 'dept-management'],
  ['Farhan', 'Ali', ROLES.LEAD, 'dept-management'],
];

// The demo admin. Signs in on the Admin tab with ADMIN_PASSWORD (from the server's environment).
export const SEED_ADMIN = { first: 'Admin', last: '(Infotact)', email: 'admin@infotact.demo', role: ROLES.ADMIN, departmentId: 'dept-management' };

/** 'Riya' → 'emp-riya'. Readable ids make the seed repeatable. */
function employeeIdFor(email) {
  return `emp-${email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/**
 * The full demo directory, desks included.
 * @returns {{ floors: object[], departments: object[], employees: object[] }}
 */
export function buildSeedDirectory() {
  const departments = [];
  for (const seed of SEED_DEPARTMENTS) {
    const deskIds = reserveBlock({ desks: layout.desks, departments, employees: [], size: seed.size });
    departments.push({ ...seed, floorId: DEFAULT_FLOOR_ID, wingId: deskIds.length ? deskIds[0].split('-')[0] : null, deskIds });
  }

  const people = [
    ...PEOPLE.map(([first, last, role, departmentId]) => ({ name: `${first} ${last}`, email: `${first.toLowerCase()}@infotact.demo`, role, departmentId })),
    { name: `${SEED_ADMIN.first} ${SEED_ADMIN.last}`, email: SEED_ADMIN.email, role: SEED_ADMIN.role, departmentId: SEED_ADMIN.departmentId },
  ];

  const employees = [];
  const createdAt = new Date('2026-11-01T09:00:00Z');
  for (const person of people) {
    const answer = chooseDesk({ desks: layout.desks, hotDesks: layout.hotDesks, departments, employees, departmentId: person.departmentId });
    const department = departments.find((d) => d._id === person.departmentId);
    department.deskIds = answer.departmentDeskIds;
    employees.push({
      _id: employeeIdFor(person.email),
      ...person,
      floorId: DEFAULT_FLOOR_ID,
      deskId: answer.deskId,
      hotDesk: answer.hotDesk,
      createdAt,
    });
  }
  return { floors: SEED_FLOORS.map((floor) => ({ ...floor })), departments, employees };
}

export { employeeIdFor };
