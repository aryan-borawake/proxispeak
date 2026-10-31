// server/index.js — Person 1
// Starts the ProxiSpeak server:
//   - Express answers normal web addresses, such as GET /api/health.
//   - Socket.io keeps a live connection open to every browser (handled in ./signaling/).
// Run it with `npm run dev` inside server/ (restarts on every save) or `npm start`.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { attachSignaling } from './signaling/index.js';
import { runGeoSelfCheck } from './signaling/geoSelfCheck.js';
import { connectDb, createGeoEngine } from './geo/index.js';
import { DEFAULT_ROOM } from '../shared/constants.js';

// Load settings from the .env file in the repo root (one level above server/).
// We give the full path so it works no matter which folder you start the server from.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// How long we wait for MongoDB at start-up before giving up and using the fake.
// Only this file uses it, so it lives here, not in shared/constants.js.
const GEO_CONNECT_TIMEOUT_MS = 3000;

// How long the geo self-check (signaling/geoSelfCheck.js) may take before we give up on it.
const GEO_SELF_CHECK_TIMEOUT_MS = 3000;

// Express app: normal web addresses.
const app = express();
app.use(cors({ origin: CLIENT_ORIGIN })); // allow the browser app on port 5173 to call us
app.use(express.json());

// Health check: answers { ok: true } so anyone can see the server is running.
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// TODO (Week 4): mount rooms routes (Person 2 writes them in server/geo/; Person 1 mounts them here).

// One HTTP server shared by Express and Socket.io.
const httpServer = createServer(app);

// Socket.io: live two-way connection with every browser.
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

/**
 * Wait for `promise`, but give up after `ms` milliseconds.
 * Promise.race waits for whichever finishes first: the real work, or a timer that fails.
 * Example: await withTimeout(connectDb(uri), 3000, 'MongoDB did not connect within 3000 ms');
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
 * Try to start Person 2's geo engine (MongoDB). Returns the engine, or null to use the fake.
 *
 * Why a fallback? The server must always start, even with no database: on a laptop without
 * MongoDB, or on this branch where server/geo/ is still a stub. With null, the proximity tick
 * uses fakeNearby.js (distances measured in memory), which gives the same kind of answer.
 *
 * Three steps, each one can send us to the fake:
 *   1. Is MONGODB_URI set in .env?
 *   2. Does connectDb finish within 3 seconds? Without a time limit, a wrong address could
 *      keep the server waiting for 30 seconds or more.
 *   3. Does the engine really answer? (the self-check, also limited to 3 seconds). A connected
 *      database is not enough: the stub "connects" but never finds anyone.
 * It always logs one "nearby engine: ..." line, so you can see which one is in use.
 *
 * @returns {Promise<object | null>}
 */
async function startGeoEngine() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[server] nearby engine: fakeNearby (MONGODB_URI is not set in .env)');
    return null;
  }

  try {
    await withTimeout(connectDb(uri), GEO_CONNECT_TIMEOUT_MS, `MongoDB did not connect within ${GEO_CONNECT_TIMEOUT_MS} ms`);
  } catch (error) {
    console.warn(`[server] geo engine not available, using fakeNearby: ${error.message}`);
    console.log('[server] nearby engine: fakeNearby (in memory)');
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
  console.log('[server] nearby engine: geo (Person 2, MongoDB)');
  return geo;
}

// `await` at the top level of a file works because this is an ES module ("type": "module").
// We start the engine BEFORE listening, so no browser can join before the tick is ready.
const geo = await startGeoEngine();
attachSignaling(io, { geo });

httpServer.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});
