// server/office/seed.js — Person 1
// Put the Infotact demo directory (16 people, 5 departments, the admin, Floor 1) into MongoDB.
//
// How to run it (from the repo root or from server/):
//   node server/office/seed.js
// It reads MONGODB_URI from the repo-root .env, or from the environment. For Atlas:
//   MONGODB_URI="mongodb+srv://…/proxispeak" node server/office/seed.js     (bash)
//   $env:MONGODB_URI="mongodb+srv://…/proxispeak"; node server/office/seed.js   (PowerShell)
// Running it twice inserts nothing the second time (see seedDb.js).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Department, Employee, Floor } from './models.js';
import { seedDatabase } from './seedDb.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) {
  dotenv.config({ path: ENV_FILE_PATH, quiet: true });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[seed] MONGODB_URI is not set. Put it in the repo-root .env, or set it before the command.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('[seed] connected to MongoDB');

  const { inserted } = await seedDatabase();
  console.log(`[seed] inserted: ${inserted.floors} floor(s), ${inserted.departments} department(s), ${inserted.employees} employee(s)`);

  const totals = await Promise.all([Floor.countDocuments(), Department.countDocuments(), Employee.countDocuments()]);
  console.log(`[seed] now in the database: ${totals[0]} floor(s), ${totals[1]} department(s), ${totals[2]} employee(s)`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`[seed] failed: ${error.message}`);
  await mongoose.disconnect();
  process.exit(1);
});
