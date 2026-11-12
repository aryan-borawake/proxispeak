// server/scripts/auth-test.js — Person 1
// A small test of sign-in (v5): the REST routes, the admin check, and joining with a token.
//
// How to run it:
//   1. In one terminal, inside server/:   npm run dev      (ADMIN_PASSWORD must be set, e.g. in .env)
//   2. In a second terminal, inside server/:   node scripts/auth-test.js
// It reads ADMIN_PASSWORD from the repo-root .env (or the environment), like the server does.
//
// What it checks (each line prints PASS or FAIL):
//   1. An email that is not in the directory → 404 "Not in the Infotact directory".
//   2. A directory email (any capitals) → 200 with a token and a profile; GET /api/me with it → 200.
//   3. Joining with that token → world:init with the directory name, room = the person's floor, a profile.
//   4. Joining with a forged token → server:error BAD_TOKEN.
//   5. The admin email with a wrong password → 401.
//   6. The employee token on /api/admin/overview → 403; no token → 401.
//   7. The admin email + ADMIN_PASSWORD → admin token → /api/admin/overview 200.
// If any check fails, the script exits with code 1.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { io } from 'socket.io-client';
import { EVENTS } from '../../shared/events.js';
import { DEFAULT_FLOOR_ID, ERROR_CODES } from '../../shared/constants.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const WAIT_MS = 2000;
const DEMO_EMPLOYEE = 'Riya@Infotact.demo'; // capitals on purpose: emails are matched in lowercase
const DEMO_ADMIN = 'admin@infotact.demo';

let failures = 0;
function check(name, passed, detail) {
  if (passed) {
    console.log(`[auth-test] PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`[auth-test] FAIL  ${name}  (${detail})`);
  }
}

/** Call one REST route. Returns { status, body }. */
async function call(method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${SERVER_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // not JSON
  }
  return { status: response.status, body: json };
}

/** Connect, send JOIN with `payload`, and resolve with the first world:init or server:error. */
function joinWith(payload) {
  return new Promise((resolve) => {
    const socket = io(SERVER_URL, { reconnection: false });
    const timer = setTimeout(() => finish({ kind: 'timeout' }), WAIT_MS);
    function finish(result) {
      clearTimeout(timer);
      socket.disconnect();
      resolve(result);
    }
    socket.on('connect_error', (error) => finish({ kind: 'connect_error', error: error.message }));
    socket.on(EVENTS.WORLD_INIT, (init) => finish({ kind: 'init', init }));
    socket.on(EVENTS.SERVER_ERROR, (error) => finish({ kind: 'error', error }));
    socket.emit(EVENTS.JOIN, payload);
  });
}

async function main() {
  try {
    await fetch(`${SERVER_URL}/api/health`);
  } catch {
    console.error(`[auth-test] could not reach ${SERVER_URL}. Is the server running? Start it with \`npm run dev\` inside server/.`);
    process.exit(1);
  }

  // 1
  const unknown = await call('POST', '/api/auth/employee', { body: { email: 'nobody@example.com' } });
  check('1. unknown email → 404 "Not in the Infotact directory"', unknown.status === 404 && unknown.body?.error === 'Not in the Infotact directory', JSON.stringify(unknown));

  // 2
  const employee = await call('POST', '/api/auth/employee', { body: { email: DEMO_EMPLOYEE } });
  const employeeToken = employee.body?.token;
  check('2a. directory email → 200 with token and profile', employee.status === 200 && typeof employeeToken === 'string' && employee.body?.profile?.email === DEMO_EMPLOYEE.toLowerCase(), JSON.stringify(employee));
  const me = await call('GET', '/api/me', { token: employeeToken });
  check('2b. GET /api/me with the employee token → 200, same person', me.status === 200 && me.body?.profile?.email === DEMO_EMPLOYEE.toLowerCase() && me.body?.admin === false, JSON.stringify(me));

  // 3
  const joined = await joinWith({ token: employeeToken });
  check(
    '3. join with the token → world:init with the directory name, the floor room and a profile',
    joined.kind === 'init' &&
      joined.init.roomId === (employee.body?.profile?.floorId || DEFAULT_FLOOR_ID) &&
      joined.init.profile?.name === employee.body?.profile?.name &&
      joined.init.office?.floorId === joined.init.roomId,
    JSON.stringify(joined).slice(0, 300),
  );

  // 4
  const forged = await joinWith({ token: `${employeeToken}x` });
  check('4. join with a forged token → BAD_TOKEN', forged.kind === 'error' && forged.error.code === ERROR_CODES.BAD_TOKEN, JSON.stringify(forged));

  // 5
  const wrongPassword = await call('POST', '/api/auth/admin', { body: { email: DEMO_ADMIN, password: 'definitely-not-the-password' } });
  check('5. admin email + wrong password → 401', wrongPassword.status === 401, JSON.stringify(wrongPassword));

  // 6
  const asEmployee = await call('GET', '/api/admin/overview', { token: employeeToken });
  check('6a. employee token on /api/admin/overview → 403', asEmployee.status === 403, JSON.stringify(asEmployee));
  const noToken = await call('GET', '/api/admin/overview');
  check('6b. no token on /api/admin/overview → 401', noToken.status === 401, JSON.stringify(noToken));

  // 7
  if (!process.env.ADMIN_PASSWORD) {
    check('7. admin sign-in with ADMIN_PASSWORD', false, 'ADMIN_PASSWORD is not set here: put it in .env (the same value the server uses)');
  } else {
    const admin = await call('POST', '/api/auth/admin', { body: { email: DEMO_ADMIN, password: process.env.ADMIN_PASSWORD } });
    const overview = await call('GET', '/api/admin/overview', { token: admin.body?.token });
    check('7. admin email + ADMIN_PASSWORD → admin token → overview 200', admin.status === 200 && admin.body?.admin === true && overview.status === 200 && typeof overview.body?.headcount === 'number', `${admin.status} ${overview.status} ${JSON.stringify(overview.body).slice(0, 200)}`);
  }

  if (failures > 0) {
    console.log(`[auth-test] ${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log('[auth-test] all checks passed');
  process.exit(0);
}

main();
