# 04 — MongoDB and the geo queries

*Code: `server/geo/` (Pratik's module: `db.js`, `geoEngine.js`, `models/Position.js`, `peerChanges.js`, `scripts/spatial-audit.js`; v6 additions by Aryan: `areas.js`, `canHear.js`, `rooms.js`, `routes.js`, `models/Area.js`, `models/Room.js`, `scripts/explain-geowithin.js`), start-up checks in `server/index.js` and `server/signaling/geoSelfCheck.js`, the office collections in `server/office/models.js`. Reports: `docs/geo-audit.md`, `docs/geo.md`.*

**MongoDB** is a database that stores **documents** (JSON-like records) in **collections** (named groups of documents). **Mongoose** is the library we use to describe what a document looks like (a **schema**) and to read and write it (a **model**).

---

## 1. What the database is for

Two questions, asked 4 times a second by the tick:

1. **"Who is within 140 px of Riya?"** → `$near`.
2. **"Who is standing inside which room?"** → `$geoWithin`.

Plus storage that must survive a restart: the employee directory, the floor layouts and their areas.

Positions are **not** written per move. They live in the server's memory; the tick writes all movers in one batch every 250 ms.

---

## 2. The `positions` collection and its 2d index

Example document:

```js
{ _id: 'kX9a2bQ…', roomId: 'floor-1', loc: [1632, 2104], updatedAt: 2026-11-12T10:00:00Z }
```

- `_id`: the player's socket id.
- `roomId`: the floor (or `office-1` for labs and tests).
- `loc`: `[x, y]` in pixels, **x first**. It is the avatar's top-left corner.

The index:

```js
// server/geo/models/Position.js
positionSchema.index(
  { loc: '2d', roomId: 1 },
  { min: 0, max: WORLD_MAX_PX } // 0 to 4096
);
```

An **index** is a sorted structure MongoDB keeps beside a collection so it can find matching documents without reading every one. Without an index, a query does a **COLLSCAN** (collection scan: read every document).

### Why `2d` and not `2dsphere`

| | `2d` | `2dsphere` |
|---|---|---|
| Built for | a flat plane | the Earth (a sphere) |
| Coordinates | any x, y within bounds | longitude −180…180, latitude −90…90 |
| Distance | straight line, in the same units as the coordinates | along the Earth's surface, in metres |
| Fits our map? | yes: pixels on a flat grid | no: `[1632, 2104]` is not a valid longitude/latitude |

Our office is a flat image, and distances are `Math.hypot(dx, dy)` in pixels, so `2d` is the right index.

### Why `min: 0, max: 4096`

A `2d` index accepts only −180 to 180 by default, because it was designed with longitude/latitude in mind. A position like `[1632, 2104]` would fail to save. So the bounds are set to 0 … 4096 (`WORLD_MAX_PX`). The generated map is 110 × 80 tiles × 32 px = 3520 × 2560 px, inside the bounds; an uploaded map may be at most 128 × 128 tiles = 4096 px (`validateTiledMap`).

### Why `roomId` is in the index

Every query also filters by floor. A **compound index** (an index on two fields) lets MongoDB narrow by both the location and the room in the same index walk. The schema also has a separate one-field index on `roomId` (`index: true`), which the `locateUsers` aggregate uses.

### Making sure the index exists

On a brand-new Atlas database, Mongoose builds indexes in the background without saying when it's done. So `server/index.js` waits: `Position.init()` then `Position.createIndexes()` (safe to repeat), within 5 s, and logs `[server] positions index ready: { loc: '2d', roomId: 1 }`.

Then a **self-check** (`geoSelfCheck.js`): save two probe users 14 px apart in a throwaway room `__selfcheck__`, ask `findNearby` within 100 px, expect the other probe, delete both. Only if that passes does the server use MongoDB (`nearby engine: geo`). Any failure → `fakeNearby` (in memory), so the server always starts.

---

## 3. Writing positions: one `bulkWrite` per tick

```js
// server/geo/geoEngine.js, upsertPositions (shortened)
validOps.push({
  updateOne: {
    filter: { _id: idStr },
    update: { $set: { roomId, loc: [u.x, u.y], updatedAt: now } },
    upsert: true,
  },
});
await Position.bulkWrite(validOps, { ordered: false });
```

1. For every mover with a valid position (numbers, 0…4096), one `updateOne` operation.
2. **Upsert** = "update if it exists, insert if not". A new player needs no separate insert.
3. All operations go in **one** `bulkWrite`: one round trip to the database.
4. `ordered: false`: one bad operation doesn't stop the others.
5. After success, each position is copied into the engine's `positionCache` (a Map), so `findNearby` can skip reading the mover's own position back.

Example with numbers: 50 people moving, 10 moves a second each = 500 moves a second arrive. Database writes: 4 `bulkWrite`s a second (one per tick).

`removeUser` deletes the document on disconnect or floor change.

---

## 4. `$near`: who is near me?

```js
// server/geo/geoEngine.js, findNearby
const nearbyDocs = await Position.find(
  {
    roomId,
    _id: { $ne: idStr },
    loc: { $near: [x0, y0], $maxDistance: maxDistancePx },
  },
  { loc: 1 }
).lean();
```

- `$near: [x0, y0]`: sort by distance from this point, nearest first, using the 2d index.
- `$maxDistance: 140`: only points within 140 px (`DISCONNECT_PX`). For a `2d` index the distance is in the same units as the coordinates: pixels.
- `_id: { $ne: me }`: never return myself.
- `{ loc: 1 }`: return only the location (a **projection**), less data.
- `.lean()`: give plain objects, not full Mongoose documents (faster).

Then the engine computes `Math.hypot` itself, keeps only `distance ≤ 140` (a safety check), rounds to 0.01 px, and sorts nearest first.

Worked example (from `docs/geo.md`): Riya at (340, 210), Sam at (395, 230), Priya at (900, 600).

| Pair | dx, dy | distance | Within 140? |
|---|---|---|---|
| Riya → Sam | 55, 20 | √(3025 + 400) ≈ 58.52 px | yes |
| Riya → Priya | 560, 390 | √(313 600 + 152 100) ≈ 682.42 px | no |

Answer: `[{ id: 'sam', distance: 58.52 }]`.

---

## 5. `$geoWithin`: who is inside which area?

An **area** is a part of the map with a hearing type: a meeting room, a desk pod, a focus room, the stage hall. It is stored as a rectangle (`box: [[x1, y1], [x2, y2]]`, top-left and bottom-right) or a polygon.

`$geoWithin` finds documents whose location lies **inside** a shape. With a `2d` index the shapes are `$box` (a rectangle given by two corners) or `$polygon` (a list of points).

### The avatar-middle shift

Areas are drawn around the avatar's **middle** point, `AVATAR_MIDDLE = { x: 12, y: 16 }` from the top-left. Stored positions are the top-left. So every shape is moved 12 px left and 16 px up before asking:

```js
// server/geo/areas.js
export function shapeOf(areaOrBox) {
  const shift = ([x, y]) => [x - AVATAR_MIDDLE.x, y - AVATAR_MIDDLE.y];
  if (Array.isArray(areaOrBox?.box)) return { $box: areaOrBox.box.map(shift) };
  if (Array.isArray(areaOrBox?.polygon)) return { $polygon: areaOrBox.polygon.map(shift) };
  …
}
```

Example: Meeting room 2 is `[[1408, 128], [1760, 608]]` in middle-point coordinates → the query box is `[[1396, 112], [1748, 592]]`. An avatar at top-left (1400, 120) has its middle at (1412, 136), inside the room; its stored `loc` (1400, 120) is inside the shifted box. Same answer.

### One area: `usersInArea` (a `find`)

```js
Position.find({ roomId, loc: { $geoWithin: shapeOf(area) } }, { _id: 1 }).lean();
```

### Every area at once: `locateUsers` (one aggregate)

The tick needs "which area is **everyone** in?" for all 66 areas. 66 queries every 250 ms would be wasteful. So it is **one** aggregate per floor:

```js
// server/geo/areas.js, locateUsers (shortened)
areas.forEach((area, index) => {
  facets[`a${index}`] = [{ $match: { loc: { $geoWithin: shapeOf(area) } } }, { $project: { _id: 1 } }];
  if (Array.isArray(area.platform)) {
    facets[`p${index}`] = [{ $match: { loc: { $geoWithin: shapeOf(area.platform) } } }, { $project: { _id: 1 } }];
  }
});
const [result] = await Position.aggregate([{ $match: { roomId } }, { $facet: facets }]);
```

- An **aggregate** (aggregation pipeline) is a list of stages that each transform the documents passed on from the stage before.
- `$match { roomId }`: keep only this floor's positions.
- `$facet`: run several small pipelines on the same input, side by side, and return all their results in one document. Here: one `$geoWithin` per area (`a0`, `a1`, …), plus one for the stage platform (`p…`).
- The result becomes a Map: `'riya' → { areaId: 'meeting-2', onPlatform: false }`. People in no area are missing from the Map: they are on open floor.
- Areas never overlap; if a point sits exactly on a shared edge, the first area in the list wins. Rooms (private, silent, stage) are sorted before open areas, so a room inside an open corridor wins.

Honest note for the viva: MongoDB's documentation says the sub-pipelines inside `$facet` cannot use indexes. So in `locateUsers` the 2d index is **not** used for the `$geoWithin` checks; the first `$match { roomId }` can use the `roomId` index, and the shape checks then run on that floor's documents (at most a few hundred). The `.explain()` below proves the index for the single-area `find`, not for the aggregate. At our sizes the aggregate is cheap (the whole tick averages 25–50 ms with 50 bots), but if a floor held thousands of people, per-area `find`s (indexed) or an in-memory check would be better.

### The real query and its `.explain()`

**`.explain()`** asks MongoDB "how would you run this query?" and, with `'executionStats'`, "how much work did it take?". `server/geo/scripts/explain-geowithin.js` saves 40 probe users in a throwaway room (3 inside Meeting room 2, 37 elsewhere), asks, and explains. Output (from `docs/build-progress.md`):

```
[geo] area "Meeting room 2 (6-8)" box [[1408,128],[1760,608]] (avatar-middle px)
[geo] query: Position.find({"roomId":"__explain__","loc":{"$geoWithin":{"$box":[[1396,112],[1748,592]]}}}, { _id: 1 })
[geo] answer: ["__in0__","__in1__","__in2__"]
[geo] explain: winning plan PROJECTION_SIMPLE ← FETCH ← IXSCAN (loc_2d_roomId_1)
[geo] explain: nReturned 3, totalKeysExamined 4, totalDocsExamined 3, executionTimeMillis 6
```

How to read it:

| Field | Value | Meaning |
|---|---|---|
| `IXSCAN (loc_2d_roomId_1)` | the index was used | not a COLLSCAN |
| `totalKeysExamined` | 4 | MongoDB looked at only 4 index entries… |
| `totalDocsExamined` | 3 | …and fetched only 3 documents… |
| `nReturned` | 3 | …and all 3 were inside, out of 40 in the room |

So the work was proportional to the answer, not to the collection.

For `$near`, Pratik's audit (`docs/geo-audit.md`) shows the winning plan `FETCH → GEO_NEAR_2D (index: loc_2d_roomId_1) → FETCH → IXSCAN`. In that audit run the explained query point had no neighbours (`nReturned 0`), so it proves the **plan** (the index is used), not the speed; the speed comes from the benchmark below.

---

## 6. The spatial audit: "every nearby query under 20 ms"

Method (`server/geo/scripts/spatial-audit.js`, Pratik):

1. Check the query plan with `.explain()` (above).
2. Seed 50 test avatars at random positions in a throwaway room.
3. 10 rounds. Each round: one `bulkWrite` of the 50, then 50 `findNearby` calls **in parallel** (`Promise.all`), each timed with `performance.now()`.
4. Write the table to `docs/geo-audit.md`.

Results (local MongoDB 8.0, Pratik's MacBook, 23 Oct 2026):

| Measure | Value |
|---|---|
| Average query latency | 9.09 ms |
| Worst single query | 15.87 ms |
| Average full tick (batch write + 50 queries) | 15.36 ms |
| Target | < 20 ms per query: met in all 10 rounds |

**Latency** here is the time from sending one query to getting its answer. Because the 50 run in parallel, each time includes waiting behind the others, so 9 ms is a fair "busy" number.

Pratik's log notes one fix that got the numbers there: an extra `findOne` before every `$near` (to read the mover's own position) was removed by caching positions in `upsertPositions`.

---

## 7. Local MongoDB versus Atlas, and the free-tier limit

| | Local (laptop) | Atlas free cluster (M0) |
|---|---|---|
| Where | `mongodb://127.0.0.1:27017/proxispeak` | `mongodb+srv://…/proxispeak` (cloud) |
| Network delay per query | well under 1 ms | depends on distance between Render and Atlas regions |
| Limits | none in practice | the team briefing (prices checked 12 Oct 2026) notes 512 MB storage and **about 100 operations a second** |
| Used for | the audit and the load test | the deployed demo |

Count the operations of one tick with 50 people all moving on one floor:

```
1 bulkWrite + 1 locateUsers aggregate + 50 findNearby ($near)  ≈ 52 operations
× 4 ticks a second                                             ≈ 208 operations a second
```

That is about twice the free tier's limit. Consequences to say honestly:

1. The 50-bot load test ran on **local** MongoDB, so its tick times do not show what Atlas free would do with 50 moving people.
2. A small demo (a handful of people) is far below the limit: 5 movers ≈ 7 operations per tick ≈ 28 a second.
3. The fix, if needed, is one query per floor instead of one `$near` per mover (e.g. fetch the floor's positions once and measure distances in memory, as `fakeNearby.js` already does), or a paid cluster. `docs/load-test.md` names this "cheapest next step".

The module brief (`docs/briefs/module-2-geospatial.md`) also says to run speed tests on local MongoDB, because the free tier's limit would make the numbers reflect Atlas, not our code.

---

## 8. The other collections

| Collection | Example `_id` | Shape | Written when |
|---|---|---|---|
| `positions` | socket id | `{ roomId, loc: [x, y], updatedAt }` | every tick (movers), deleted on leave |
| `areas` | `'floor-1:meeting-2'` | `{ floorId, areaId, name, type, box \| polygon, platform?, updatedAt }` | start-up and after a layout upload (`deleteMany` + `insertMany`) |
| `rooms` | `'floor-1'` | `{ floorId, name, map /* Tiled JSON, ~150 KB */, desks, areas, version, source: 'generated' \| 'uploaded', mapHash, updatedAt }` | start-up (if the generated map changed) and on upload / "use generated" |
| `employees` | `'emp-riya'` | `{ email (unique, lowercase), name, role, departmentId, floorId, deskId, hotDesk, createdAt }` | after each admin action |
| `departments` | `'dept-engineering'` | `{ name, color, floorId, wingId, size, deskIds }` | after each admin action |
| `floors` | `'floor-1'` | `{ name, tier }` | when a floor is added or its tier grows |
| `alerts` | `'alert-3f9a1c2b'` | `{ type, message, floorId, createdAt, resolved }` | hot-desk overflow, wing opened, floor added |

Notes:

- **Readable ids** (`emp-riya`, `dept-engineering`) instead of MongoDB's random ObjectIds, so the seed script can run twice without making duplicates (it upserts by `_id`).
- The directory is kept in memory and written with one `bulkWrite` of `replaceOne`s per collection after each change (`flush` in `server/office/store.js`). See `07-office-model.md`.
- `areas` are read back from MongoDB at start-up (`saveAreas` then `loadAreas`), so the tick's areas are exactly the stored ones (`[server] floor-1: layout version 1 (generated), 66 areas stored in MongoDB`).
- `rooms.mapHash` is a short SHA-256 fingerprint of the map; a new version is stored only when it changed, and an uploaded map is never overwritten by the generator.
- Without MongoDB, `rooms.js` keeps rooms in a Map in memory, and areas come from `layout.json`.

---

## 9. What to say if asked "why MongoDB at all, if positions are in memory?"

1. The spec asked for MongoDB with a geospatial index, and `$near` / `$geoWithin` are its built-in answers to our two questions.
2. The same database also stores what must survive a restart (directory, layouts, areas).
3. With several server copies (the Redis plan), the database is one shared place every copy can ask.

And the honest trade-off: for one server and one floor, an in-memory distance loop (`fakeNearby.js`) is simpler and faster. The database version pays a network trip per query, which is why the operation count in section 7 matters.
