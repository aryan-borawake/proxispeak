// server/office/reset-demo.js — Person 1
// Put the demo back to the start: delete EVERY employee, department, floor and alert, then seed the
// demo directory again (16 people + admin, 5 departments, Floor 1 at tier 1).
// Use it before a demo, or after the walkthrough / floor test added sample hires and Floor 2.
//
//   node server/office/reset-demo.js --yes        (then restart the server: it loads the office at start-up)
//
// It refuses to run without --yes, because it deletes data. Point MONGODB_URI at the right database!

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Alert, Department, Employee, Floor } from './models.js';
import { seedDatabase } from './seedDb.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('[reset] this deletes all employees, departments, floors and alerts. Run again with --yes to do it.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('[reset] MONGODB_URI is not set (repo-root .env or the environment).');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const deleted = await Promise.all([Employee.deleteMany({}), Department.deleteMany({}), Floor.deleteMany({}), Alert.deleteMany({})]);
  console.log(`[reset] deleted ${deleted[0].deletedCount} employees, ${deleted[1].deletedCount} departments, ${deleted[2].deletedCount} floors, ${deleted[3].deletedCount} alerts`);
  const { inserted } = await seedDatabase();
  console.log(`[reset] seeded ${inserted.employees} employees, ${inserted.departments} departments, ${inserted.floors} floor(s). Restart the server to load them.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`[reset] failed: ${error.message}`);
  await mongoose.disconnect();
  process.exit(1);
});
