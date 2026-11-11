# Pratik — Daily Log

Module 2: Geospatial Engine · Branch `pratik`

## 22 Oct 2026 — Geospatial Engine Verification & Integration Readiness

### Today's Learning
- Reinforced how flat Cartesian 2D coordinates (`[x, y]`) on an HTML5 canvas map require MongoDB's `2d` spatial index with explicit bounds `{ min: 0, max: 4096 }` (`WORLD_MAX_PX`) rather than geographic `2dsphere`.
- Learned how hysteresis thresholds prevent voice chat flapping: avatars initiate audio only when within 100 px (`EARSHOT_PX`) and disconnect once beyond 140 px (`DISCONNECT_PX`), maintaining stability in the 100–140 px buffer.
- Understood how in-memory position caching paired with `{ loc: 1 }` field projections reduces database roundtrips, allowing 50 concurrent spatial queries to run under 10 ms (~8.96 ms measured).

### Work Completed
- Verified all Module 2 core implementations committed and pushed to `origin/pratik` (commit `60249d8`): `db.js`, `Position.js`, `geoEngine.js`, `peerChanges.js`, and `index.js`.
- Confirmed deterministic test suite (`test-nearby.js`) passes all 16 tests covering known distance radii (50, 99, 101, 150 px), self-exclusion, room isolation, and peer change boundaries.
- Re-verified MongoDB query plan via `.explain()`, proving that proximity queries execute through `GEO_NEAR_2D -> FETCH -> IXSCAN` on index `loc_2d_roomId_1` with zero full-table scans.
- Confirmed spatial audit performance benchmark (`spatial-audit.js`) over 10 rounds of 50 parallel queries, achieving an average query latency of ~8.96 ms and full tick duration of ~15.15 ms.
- Maintained clean repository boundaries: all changes confined to `server/geo/` and `docs/`, with zero modifications to shared contracts or other teammates' files.

### Key Takeaways
- Batching position updates into a single `bulkWrite` per 250 ms tick prevents database connection exhaustion and keeps write traffic predictable.
- Combining MongoDB `$near` with exact Euclidean distance (`Math.hypot`) ensures accurate nearest-first player discovery on a flat grid.
- Pure functions like `computePeerChanges` make complex state transition logic simple to test without database dependencies.

### Next Steps
- Coordinate with Person 1 (Aryan) to connect `createGeoEngine` into `server/index.js` (`attachSignaling(io, { geo })`).
- Open the Integration #1 pull request from `pratik` into `dev` on GitHub.
- Review upcoming Week 3 requirements for zone persistence (`models/Zone.js`) and `$geoWithin` meeting room boundaries.

## 21 Oct 2026 — Tasks 2–11: Core Geospatial Engine, Test Suite, and Spatial Audit

**What I built**
- Implemented `server/geo/db.js` with idempotent connection management (`connectDb`, `disconnectDb`).
- Created `server/geo/models/Position.js` with compound 2D index `{ loc: '2d', roomId: 1 }` bounded to `[0, 4096]` (`WORLD_MAX_PX`).
- Built `server/geo/scripts/seed-fake-users.js` supporting configurable user counts and rooms.
- Built `server/geo/geoEngine.js` implementing `createGeoEngine` with `upsertPositions` (single `bulkWrite`), `findNearby` (`$near` with `Math.hypot` distance calculation, room isolation, and self-exclusion), and `removeUser`.
- Built `server/geo/peerChanges.js` implementing pure `computePeerChanges` hysteresis (100 px connect / 140 px disconnect).
- Exported the complete public API matching `CONTRACTS.md` from `server/geo/index.js`.
- Implemented `server/geo/scripts/test-nearby.js` with 16 deterministic tests (known distances 50, 99, 101, 150 px, room isolation, self-exclusion, removal, and all hysteresis edge cases); all 16 passed.
- Implemented `server/geo/scripts/spatial-audit.js` and benchmarked 10 rounds of 50 parallel queries; verified query plan uses `loc_2d_roomId_1` with `GEO_NEAR_2D` stage, achieving ~9.0–9.3 ms average latency (< 20 ms target) and ~15.2–16.4 ms full tick duration (with 9/10 rounds staying under 16 ms peak).
- Authored comprehensive technical documentation in `docs/geo.md` and benchmark report in `docs/geo-audit.md`.

**How it works (in my own words)**
- When avatars move, `upsertPositions` bundles all coordinate updates into a single `bulkWrite` operation, drastically reducing database traffic to one round-trip per tick.
- `findNearby` queries the 2D index using `$near` with `$maxDistance` and calculates exact Euclidean distance using `Math.hypot`. An in-memory position cache avoids redundant `findOne` queries, speeding up parallel lookups.
- `computePeerChanges` enforces hysteresis: avatars must come within 100 px to start WebRTC audio and only disconnect once beyond 140 px, eliminating connection flapping.

**Problems and how I fixed them**
- During initial parallel testing of 50 concurrent queries, latency occasionally spiked above 20 ms due to redundant `findOne` calls preceding each `$near` query. I resolved this by caching positions in memory during `upsertPositions` and using `{ loc: 1 }` field projections, dropping average query latency to ~9.0 ms.
- Mongoose `.explain('executionStats')` returned a `FETCH` root stage for execution; inspecting `queryPlanner.winningPlan` confirmed `GEO_NEAR_2D` as the driving spatial index stage on `loc_2d_roomId_1`.

**What I learned**
- How MongoDB constructs execution stages (`GEO_NEAR_2D` driving `FETCH` and `IXSCAN`) for 2D flat indexes.
- How in-memory position caching paired with periodic batch writes keeps high-frequency spatial operations under 10 ms without overloading the database.
- How to structure deterministic test suites with known geometric points to verify boundary conditions reliably.

**Tomorrow**
- Prepare pull request into `dev` for Integration #1.
- Coordinate with Person 1 (Aryan) for `server/index.js` integration (`attachSignaling(io, { geo })`).
- Begin preparation for Week 3 zones (`server/geo/models/Zone.js` and `$geoWithin`).

## 20 Oct 2026 — Task 1: local MongoDB setup and module preparation

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
