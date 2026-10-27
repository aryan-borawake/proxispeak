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
 * Try to start Person 2's geo engine (MongoDB). Returns the engine, or null if it can't start.
 *
 * Why a fallback? The server must always start, even with no database: on a laptop without
 * MongoDB, or on this branch where server/geo/ is still a stub. With null, the proximity tick
 * uses fakeNearby.js (distances measured in memory), which gives the same kind of answer.
 *
 * Promise.race waits for whichever finishes first: connecting, or a 3-second timer that fails.
 * Without the timer, a wrong address could keep the server waiting for 30 seconds or more.
 *
 * @returns {Promise<object | null>}
 */
async function startGeoEngine() {
  let timer = null;
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set in .env');
    }

    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`MongoDB did not connect within ${GEO_CONNECT_TIMEOUT_MS} ms`));
      }, GEO_CONNECT_TIMEOUT_MS);
    });
    await Promise.race([connectDb(uri), timeout]);

    const geo = createGeoEngine({ roomId: DEFAULT_ROOM });
    console.log('[server] nearby engine: geo (Person 2, MongoDB)');
    return geo;
  } catch (error) {
    console.warn(`[server] geo engine not available, using fakeNearby: ${error.message}`);
    return null;
  } finally {
    // Stop the timer if connecting won, so it doesn't fire later for nothing.
    clearTimeout(timer);
  }
}

// `await` at the top level of a file works because this is an ES module ("type": "module").
// We start the engine BEFORE listening, so no browser can join before the tick is ready.
const geo = await startGeoEngine();
if (geo === null) {
  console.log('[server] nearby engine: fakeNearby (in memory)');
}
attachSignaling(io, { geo });

httpServer.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});
