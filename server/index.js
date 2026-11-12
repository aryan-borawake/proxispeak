// server/index.js — Person 1
// Starts the ProxiSpeak server:
//   - Express answers normal web addresses, such as GET /api/health.
//   - Socket.io keeps a live connection open to every browser (handled in ./signaling/).
// Run it with `npm run dev` inside server/ (restarts on every save) or `npm start`
// (plain node, no restarts: this is what Render runs, see render.yaml and docs/deploy.md).

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { attachSignaling } from './signaling/index.js';
import { runGeoSelfCheck } from './signaling/geoSelfCheck.js';
import { connectDb, createGeoEngine, createRoomsRouter, ensureGeneratedRoom, loadAreas, Position, saveAreas } from './geo/index.js';
import { EVENTS } from '../shared/events.js';
import { requireAdmin } from './auth/middleware.js';
import { DEFAULT_ROOM } from '../shared/constants.js';
import { createAuthRouter } from './auth/routes.js';
import { createOfficeRouter } from './office/routes.js';
import { getFloor, listFloors, loadOffice } from './office/store.js';
import { layout, officeMap } from './office/layout.js';
import { setRoomAreas } from './signaling/roomAreas.js';
import { getLastTickStats, recheckRoom } from './signaling/tick.js';

// Load settings from the .env file in the repo root (one level above server/), IF it exists.
// On a laptop the file is there. On Render it is not (it is git-ignored, so it never reaches
// GitHub): there, the same names arrive as real environment variables set in Render's dashboard.
// We give the full path so it works no matter which folder you start the server from.
const ENV_FILE_PATH = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) {
  dotenv.config({ path: ENV_FILE_PATH, quiet: true });
  console.log('[server] settings: loaded the .env file in the repo root');
} else {
  console.log('[server] settings: no .env file, using environment variables only (normal on Render)');
}

// Render tells the server which port to use through PORT. On a laptop .env says 3001.
const PORT = Number(process.env.PORT) || 3001;

// Listen on every network card, not only "this computer" (127.0.0.1). Render forwards
// visitors to the server from outside the machine, so 127.0.0.1 alone would never be reached.
const HOST = '0.0.0.0';

// The Vite dev server address. It is always allowed, so local development needs no setting.
const LOCAL_CLIENT_ORIGIN = 'http://localhost:5173';

// Which web pages may talk to this server (CORS). See readAllowedOrigins below.
const ALLOWED_ORIGINS = readAllowedOrigins(process.env.CLIENT_ORIGIN);

// How long we wait for MongoDB at start-up before giving up and using the fake.
// Atlas (MongoDB in the cloud) can take several seconds on a cold start, so 10 seconds.
// Only this file uses these three numbers, so they live here, not in shared/constants.js.
const GEO_CONNECT_TIMEOUT_MS = 10000;

// How long creating the positions index may take (see ensurePositionsIndex).
const GEO_INDEX_TIMEOUT_MS = 5000;

// How long the geo self-check (signaling/geoSelfCheck.js) may take before we give up on it.
const GEO_SELF_CHECK_TIMEOUT_MS = 5000;

// Which "who is near" engine is in use: 'geo' (Person 2, MongoDB) or 'fakeNearby' (in memory).
// startGeoEngine sets it; /api/health reports it.
let engineName = 'fakeNearby';

/**
 * Turn CLIENT_ORIGIN into the list of allowed origins.
 *
 * An origin is the start of a web address: scheme + host (+ port), with no path.
 * Example: the page https://proxispeak-client.onrender.com/?lab=rtc has the origin
 * https://proxispeak-client.onrender.com. Browsers send it with every request, and the server
 * answers only origins on this list (CORS = Cross-Origin Resource Sharing).
 *
 * CLIENT_ORIGIN may hold several origins separated by commas. We trim spaces, drop empty
 * entries and remove a trailing "/", because the browser never sends one, so
 * "https://x.onrender.com/" would never match. http://localhost:5173 is always added.
 *
 * Example: "https://a.onrender.com/, https://b.example.com"
 *   → ['http://localhost:5173', 'https://a.onrender.com', 'https://b.example.com']
 *
 * @param {string | undefined} setting - process.env.CLIENT_ORIGIN
 * @returns {string[]}
 */
function readAllowedOrigins(setting) {
  const origins = new Set([LOCAL_CLIENT_ORIGIN]); // a Set keeps each origin only once
  const parts = (setting || '').split(',');
  for (const part of parts) {
    let origin = part.trim();
    while (origin.endsWith('/')) {
      origin = origin.slice(0, -1);
    }
    if (origin !== '') {
      origins.add(origin);
    }
  }
  return Array.from(origins);
}

// Express app: normal web addresses.
const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS })); // only our own web pages may call us from a browser
// JSON bodies (100 KB at most), except the layout upload, which reads up to 5 MB itself (geo/routes.js).
const readJson = express.json();
const isLayoutUpload = (req) => req.method === 'POST' && req.path.startsWith('/api/rooms/') && req.path.endsWith('/layout');
app.use((req, res, next) => (isLayoutUpload(req) ? next() : readJson(req, res, next)));

// Health check. Render calls it (healthCheckPath in render.yaml) to know the server is up.
// Example answer: { ok: true, engine: 'geo', uptimeS: 42 }
//   engine:  'geo' (MongoDB) or 'fakeNearby' (in memory, because MongoDB was not available)
//   uptimeS: how many seconds this server has been running
app.get('/api/health', (req, res) => {
  // v6: tick = the last 5-second window of proximity-tick timing (load test), or null.
  res.json({ ok: true, engine: engineName, uptimeS: Math.round(process.uptime()), tick: getLastTickStats() });
});


// v5: the sign-in routes (/api/auth/…, /api/me). The office and admin routes are mounted further
// down, once signaling is attached (the admin page asks signaling who is online).
app.use(createAuthRouter());

// One HTTP server shared by Express and Socket.io.
const httpServer = createServer(app);

// Socket.io: live two-way connection with every browser. Same allowed origins as Express.
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS },
});

/**
 * Wait for `promise`, but give up after `ms` milliseconds.
 * Promise.race waits for whichever finishes first: the real work, or a timer that fails.
 * Example: await withTimeout(connectDb(uri), 10000, 'MongoDB did not connect within 10000 ms');
 *
 * @param {Promise<unknown>} promise - the work we are waiting for
 * @param {number} ms - the time limit
 * @param {string} timeoutMessage - the error message if the time runs out
 * @returns {Promise<unknown>} whatever `promise` gives back
 */
async function withTimeout(promise, ms, timeoutMessage) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    // Stop the timer if the work won, so it doesn't fire later for nothing.
    clearTimeout(timer);
  }
}

/**
 * Make sure the positions collection has its 2d index: { loc: '2d', roomId: 1 }, min 0, max 4096
 * (CONTRACTS.md section 9). findNearby uses $near, and $near fails without that index.
 *
 * Why here? Person 2's model (geo/models/Position.js) declares the index, and Mongoose builds it
 * by itself after connecting ("autoIndex"). But it does that in the background, without telling
 * anyone when it's done. On a brand-new Atlas database the self-check could then run before the
 * index exists, and fail. So we wait for it:
 *   1. Position.init() waits for Mongoose's own background work (create the collection, then
 *      build the indexes listed in the schema).
 *   2. Position.createIndexes() asks for every schema index once more. If an index already
 *      exists with the same settings, MongoDB does nothing, so this is safe on every start.
 * We only call the model; nothing in server/geo/ changes.
 *
 * @returns {Promise<void>}
 */
async function ensurePositionsIndex() {
  await Position.init();
  await Position.createIndexes();
}

/**
 * Try to start Person 2's geo engine (MongoDB). Returns the engine, or null to use the fake.
 *
 * Why a fallback? The server must always start, even with no database: on a laptop without
 * MongoDB, or on Render with a wrong MONGODB_URI. With null, the proximity tick uses
 * fakeNearby.js (distances measured in memory), which gives the same kind of answer.
 *
 * Four steps, each one can send us to the fake:
 *   1. Is MONGODB_URI set (in .env, or in Render's environment)?
 *   2. Does connectDb finish within 10 seconds? Without a time limit, a wrong address could
 *      keep the server waiting for 30 seconds or more.
 *   3. Is the 2d index ready (within 5 seconds)?
 *   4. Does the engine really answer? (the self-check, within 5 seconds). A connected
 *      database is not enough: the engine must find a probe user we just saved.
 * It always logs one "nearby engine: ..." line, so you can see which one is in use.
 *
 * @returns {Promise<object | null>}
 */
async function startGeoEngine() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[server] nearby engine: fakeNearby (MONGODB_URI is not set)');
    return null;
  }

  try {
    await withTimeout(connectDb(uri), GEO_CONNECT_TIMEOUT_MS, `MongoDB did not connect within ${GEO_CONNECT_TIMEOUT_MS} ms`);
  } catch (error) {
    console.warn(`[server] geo engine not available, using fakeNearby: ${error.message}`);
    console.warn('[server] check MONGODB_URI, and on Atlas check that Network Access allows 0.0.0.0/0');
    console.log('[server] nearby engine: fakeNearby (in memory)');
    return null;
  }

  try {
    await withTimeout(ensurePositionsIndex(), GEO_INDEX_TIMEOUT_MS, `no answer within ${GEO_INDEX_TIMEOUT_MS} ms`);
    console.log("[server] positions index ready: { loc: '2d', roomId: 1 }");
  } catch (error) {
    console.warn(`[server] nearby engine: fakeNearby (could not create the positions index: ${error.message})`);
    return null;
  }

  try {
    await withTimeout(
      runGeoSelfCheck(createGeoEngine),
      GEO_SELF_CHECK_TIMEOUT_MS,
      `no answer within ${GEO_SELF_CHECK_TIMEOUT_MS} ms`,
    );
  } catch (error) {
    console.warn(`[server] nearby engine: fakeNearby (geo self-check failed: ${error.message})`);
    return null;
  }

  const geo = createGeoEngine({ roomId: DEFAULT_ROOM });
  engineName = 'geo';
  console.log('[server] nearby engine: geo (Person 2, MongoDB)');
  return geo;
}

// `await` at the top level of a file works because this is an ES module ("type": "module").
// We start the engine BEFORE listening, so no browser can join before the tick is ready.
const geo = await startGeoEngine();

// v5: the Infotact directory (employees, departments, floors, alerts). It uses MongoDB when
// startGeoEngine connected it, otherwise the demo directory in memory (office/store.js).
await loadOffice();

// v6, room persistence: every floor has a stored layout in the `rooms` collection (map, desks, areas,
// version). At start-up the generated layout is stored (a new version when it changed; an uploaded one
// is kept). Its areas are then stored in the `areas` collection and read back from it, so the tick's
// $geoWithin questions use the stored shapes. Without MongoDB all of this lives in memory.
async function ensureRoomFor(floorId, options) {
  return ensureGeneratedRoom({
    floorId,
    name: getFloor(floorId)?.name || floorId,
    map: officeMap(),
    desks: layout.desks,
    areas: layout.areas || [],
    mapHash: layout.mapHash || '',
  }, options);
}
async function applyRoomAreas(floorId, areas) {
  setRoomAreas(floorId, areas);
  if (!geo) return areas.length;
  const saved = await saveAreas(floorId, areas);
  setRoomAreas(floorId, await loadAreas(floorId));
  return saved;
}
for (const floor of listFloors()) {
  const room = await ensureRoomFor(floor._id);
  const saved = await applyRoomAreas(floor._id, room.areas);
  console.log(`[server] ${floor._id}: layout version ${room.version} (${room.source}), ${saved} areas${geo ? ' stored in MongoDB' : ' (in memory)'}`);
}

// createGeoEngine is passed too, so every floor (its own room) can get its own geo engine.
const signaling = attachSignaling(io, { geo, createGeoEngine: geo ? createGeoEngine : null });
app.use(createOfficeRouter({ getOnlineEmployeeIds: signaling.getOnlineEmployeeIds }));

// v6: GET /api/rooms/:id (a floor's stored layout), GET /api/rooms and POST /api/rooms/:id/layout (admin).
// After an upload: the floor's areas are replaced, everyone on it is re-checked by the next tick, and
// their browsers get EVENTS.LAYOUT_UPDATE (they load the new map).
app.use(
  createRoomsRouter({
    requireAdmin,
    isFloor: (id) => Boolean(getFloor(id)),
    ensureRoom: ensureRoomFor,
    onLayoutSaved: async (room) => {
      try {
        await applyRoomAreas(room.floorId, room.areas);
        recheckRoom(room.floorId);
        io.to(room.floorId).emit(EVENTS.LAYOUT_UPDATE, { floorId: room.floorId, version: room.version });
      } catch (error) {
        console.error(`[server] could not apply the new layout of ${room.floorId}:`, error);
      }
    },
  }),
);

// Log who may connect, so a CORS problem on Render is easy to spot in the logs.
console.log(`[server] allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] listening on ${HOST}:${PORT} (engine: ${engineName})`);
});
