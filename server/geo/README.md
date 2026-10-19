# server/geo/ — Module 2, Geospatial engine

**Owner:** Person 2 (Pratik), branch `pratik`.

**Purpose:** answers "who is near whom?" very fast, using MongoDB's 2d index. It saves positions in one batch, finds people within a distance, and decides who came close (within 100 px) and who walked away (beyond 140 px). Weeks 3–4 add zones and saved office maps.

**Interface:** `connectDb`, `createGeoEngine` (`upsertPositions`, `findNearby`, `removeUser`) and `computePeerChanges`. See `CONTRACTS.md`, "Server module interfaces".

**Scripts:** small programs you run yourself (seed fake users, tests, the speed audit) go in `scripts/`.

**Plan:** [`docs/briefs/module-2-geospatial.md`](../../docs/briefs/module-2-geospatial.md). Start with Task 1.
