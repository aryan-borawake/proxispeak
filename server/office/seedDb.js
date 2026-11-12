// server/office/seedDb.js — Person 1
// Write the demo directory into MongoDB WITHOUT making duplicates. Used by seed.js (the command
// you run by hand) and by store.js (automatically, when the database has no employees yet).
//
// "Idempotent" = running it twice gives the same result as running it once. We use upserts with
// $setOnInsert: "if a document with this _id exists, leave it alone; if not, insert it". So a second
// run inserts nothing, and it never overwrites changes the admin made (a resized department, a moved
// person). Employees are matched by email, so the same person is never added twice.

import { Alert, Department, Employee, Floor } from './models.js';
import { buildSeedDirectory } from './seedData.js';

/**
 * @returns {Promise<{ inserted: { floors: number, departments: number, employees: number } }>}
 */
export async function seedDatabase() {
  const { floors, departments, employees } = buildSeedDirectory();

  // Make sure the unique email index exists before inserting (it is what forbids duplicates).
  await Promise.all([Employee.init(), Department.init(), Floor.init(), Alert.init()]);

  const floorResult = await Floor.bulkWrite(
    floors.map((floor) => ({ updateOne: { filter: { _id: floor._id }, update: { $setOnInsert: floor }, upsert: true } })),
  );
  const departmentResult = await Department.bulkWrite(
    departments.map((department) => ({ updateOne: { filter: { _id: department._id }, update: { $setOnInsert: department }, upsert: true } })),
  );
  const employeeResult = await Employee.bulkWrite(
    employees.map((employee) => ({ updateOne: { filter: { email: employee.email }, update: { $setOnInsert: employee }, upsert: true } })),
  );

  return {
    inserted: {
      floors: floorResult.upsertedCount,
      departments: departmentResult.upsertedCount,
      employees: employeeResult.upsertedCount,
    },
  };
}
