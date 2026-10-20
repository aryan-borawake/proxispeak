# Pratik — Daily Log

Module 2: Geospatial Engine · Branch `pratik`

## 21 Oct 2026 — Task 1: local MongoDB setup and module preparation

**What I did**
- Set up MongoDB Community Server locally on macOS and verified the background service is running.
- Connected to the local database using `mongosh` to confirm the daemon accepts connections.
- Tested a local Node.js connection to MongoDB, successfully inserting and retrieving a test document.
- Studied the ProxiSpeak Geospatial Engine specifications: 2D pixel coordinates, MongoDB `2d` index, `$near` proximity query, and planned `$geoWithin` zone boundaries.
- Studied and confirmed the proximity thresholds: connect at 100 pixels (`EARSHOT_PX`) and disconnect beyond 140 pixels (`DISCONNECT_PX`).
- Recorded and pushed initial setup progress in commit `2e48feb`.

**How it works (in my own words)**
- ProxiSpeak represents avatars on a 2D canvas using pixel coordinates `[x, y]` rather than spherical latitude and longitude, so MongoDB's flat `2d` index bounded to `[0, 4096]` (`WORLD_MAX_PX`) is required instead of `2dsphere`.
- Proximity discovery uses MongoDB's `$near` query to find nearby users, while zone boundary checks (like meeting rooms) will use `$geoWithin` in later phases.
- To prevent voice connection flickering when avatars hover at the boundary, connections engage at `EARSHOT_PX` (100 px) and only drop once past `DISCONNECT_PX` (140 px).
- Avatar positions stay in server memory and batch-write to MongoDB 4 times per second (every 250 ms tick) to keep individual database queries fast and well within Atlas/local operational limits.

**Problems and how I fixed them**
- My branch `pratik` was initially on commit `3233e38` without the team skeleton. Following `docs/git-guide.md`, I performed the one-time fast-forward merge of `main` into `pratik` to bring in `CONTRACTS.md`, `shared/`, and module folders without conflicts.
- Initially, `mongod` was not running in the environment; I set up MongoDB Community Server locally and verified connectivity via `mongosh` before testing database operations with Node.js.

**What I learned**
- Why flat coordinate systems need a `2d` index with explicit bounds `{ min: 0, max: 4096 }` rather than `2dsphere`.
- The importance of hysteresis (100 px connect vs 140 px disconnect) in real-time spatial audio to avoid flapping.
- The project's contract-first structure: only touch `server/geo/` and `docs/logs/pratik.md`, never hand-code event names or constants, and keep the public API matching `CONTRACTS.md`.

**Tomorrow**
- Task 2: Create `server/geo/models/Position.js` with the 2D index bounded to `[0, 4096]`.
- Task 3: Build `server/geo/scripts/seed-fake-users.js` to populate test avatars.
- Task 4: Implement and test the first `findNearby` query with `$near`.
