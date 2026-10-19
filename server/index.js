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

// Load settings from the .env file in the repo root (one level above server/).
// We give the full path so it works no matter which folder you start the server from.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

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

// TODO (Task 9): connect MongoDB and create the geo engine, then pass it in instead of null:
//   await connectDb(process.env.MONGODB_URI);
//   const geo = createGeoEngine({ roomId: DEFAULT_ROOM });
attachSignaling(io, { geo: null });

httpServer.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});
