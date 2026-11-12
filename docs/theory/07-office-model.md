# 07 — The Infotact office model: people, desks, tiers, floors

*Code: `server/office/` (`models.js`, `store.js`, `desks.js`, `tiers.js`, `rebalance.js`, `layout.js`, `layout.json`, `routes.js`, `seedData.js`, `seed.js`, `seedDb.js`, `reset-demo.js`), the generator `server/scripts/build-office-map.js` + `server/scripts/office-map/` (`plan.js`, `builder.js`, `tiles.js`), layouts in `server/geo/rooms.js` + `routes.js`, the admin page `client/src/app/AdminPage.jsx`, `AdminSections.jsx`, `AdminLayouts.jsx`. Tests: `server/scripts/office-rules-test.js` (27 checks), `floor-test.js`, `rooms-test.js`.*

The voice part works for anyone on any map. The office model turns it into a product for one company (Infotact): a directory of employees, departments that sit together, a floor that opens as the company grows, and an admin who manages it.

---

## 1. The words

| Word | Meaning | Example |
|---|---|---|
| **Employee** | A person in the directory | `emp-riya`, Riya Sharma, lead, Engineering, desk A-01 |
| **Department** | A team with a colour and a **block** of reserved desks | Engineering, `#2f80ed`, size 8, desks A-01 … A-08 |
| **Desk** | One of 100 desks on a floor, in 4 **neighbourhoods** (also called wings) A–D of 25 | `A-07` |
| **Hot desk** | A shared overflow desk in the hot-desk room | `H-01` … `H-14` |
| **Tier** | How many neighbourhoods of a floor are open | tier 2 = A + B |
| **Floor** | A copy of the same floor plan, with its own people; also a Socket.io room | `floor-1`, `floor-2` |
| **Alert** | A message for the admin | "Floor 1 is full: 10 people are on hot desks …" |

The demo directory (`server/office/seedData.js`): 16 made-up people with `@infotact.demo` emails in 5 departments, plus `admin@infotact.demo`. Department sizes add up to 25, so the demo starts at tier 1:

| Department | Size | Block | People |
|---|---|---|---|
| Engineering | 8 | A-01 … A-08 | Riya A-01, Arjun A-02, Neha A-03, Kabir A-04, Sneha A-05 |
| Design | 4 | A-09 … A-12 | Ananya A-09, Vikram A-10, Meera A-11 |
| Marketing | 4 | A-13 … A-16 | Rohan A-13, Isha A-14, Dev A-15 |
| HR | 3 | A-17 … A-19 | Priya A-17, Aditya A-18 |
| Management | 6 | A-20 … A-25 | Sanjay A-20, Kavya A-21, Farhan A-22, Admin A-23 |

---

## 2. Memory first, MongoDB after every change

```js
// server/office/store.js
const state = { floors: new Map(), departments: new Map(), employees: new Map(), alerts: new Map() };
```

Why: the signaling server asks "who is this token's employee?" on every join and "is this wing closed?" on every move. Asking MongoDB each time would be slow. The directory is small, so it lives in Maps.

Every admin action follows the same pattern (`finishChange`):

1. Change the Maps and mark the changed documents.
2. Recompute every floor's tier (an opened wing adds an alert).
3. `flush()`: one `bulkWrite` of `replaceOne` operations per collection, for the marked documents only.
4. Emit `officeEvents 'change'`. Signaling listens (`watchOfficeChanges`): it refreshes every online employee's facts (desk, department name and colour), sends `office:update` to each changed floor, and moves online people whose department moved floor.

At start-up `loadOffice()` reads all four collections into memory. An empty database is seeded first. Without MongoDB it uses the demo directory in memory and logs that changes are lost on restart.

The seed (`node server/office/seed.js`) is **idempotent**: running it twice inserts nothing the second time (`$setOnInsert` upserts by readable `_id` / email), and it never overwrites the admin's changes.

---

## 3. The desk rule (`chooseDesk`)

Example: Engineering has block A-01 … A-08 and 5 people. A 6th engineer is hired.

1. **A free desk in the department's own block** → A-06. Done (`own-block`).

Now Engineering has 8 people in its 8 desks, and a 9th is hired:

2. **Grow the block into the free desk right next to it** (same neighbourhood): after the block's last desk (A-09), else before its first. A-09 is reserved by Design, so not free. Before A-01: none. → no.
3. **A free, unreserved desk anywhere on the floor**, neighbourhoods in opening order A → D. Wing A is fully reserved, so the first free one is B-01 → it joins Engineering's block (`elsewhere`). B-01 is in neighbourhood B, so the floor's tier grows to 2 and B opens.
4. If every desk is taken or reserved: **a free hot desk** (`hot-desk`, `hotDesk: true`), and the admin's "Floor N is full" alert is created or updated.
5. If the 14 hot desks are taken too: **no desk** (`floor-full`).

```js
// server/office/desks.js, chooseDesk (the five steps)
const ownFree = blockIds.find((deskId) => !occupiedBy.has(deskId));            // 1
const neighbour = findNeighbourDesk({ desks, department, reservedBy, occupiedBy }); // 2
const elsewhere = findAnyFreeDesk({ desks, reservedBy, occupiedBy });          // 3
const freeHotDesk = hotDesks.find((hotDesk) => !occupiedBy.has(hotDesk.id));   // 4
return { kind: DESK_RESULTS.FLOOR_FULL, deskId: null, … };                     // 5
```

Why a **pure function** (one that only reads its inputs and returns an answer: no database, no network)? So every case can be tested with made-up data. `office-rules-test.js` checks: first 3 hires → own block; 4th → grow into the neighbour; 5th with both neighbours taken → elsewhere; 101st → hot desk H-01; after 14 hot desks → `floor-full`; the input is never changed.

### Snake numbering

Desks in a neighbourhood are numbered in a **snake**: along row 0 left to right, row 1 right to left, row 2 left to right, and so on. So desk n and n + 1 are always neighbours, and "grow the block by one" always means "the desk beside it".

```
 row 0:  A-01 → A-02 → A-03 → A-04 → A-05
                                       ↓
 row 1:  A-10 ← A-09 ← A-08 ← A-07 ← A-06
          ↓
 row 2:  A-11 → A-12 → …
```

In words: the numbers run left to right, then drop a row and run back right to left, like a snake, so consecutive numbers always touch.

### Blocks: `reserveBlock` and `resizeBlock`

- **New department** (`reserveBlock`): first choice, one unbroken run of free, unreserved desks in a single neighbourhood (A → D). Example: 20 desks of A are reserved, size 8 → B-01 … B-08. If no neighbourhood has such a run, free desks are taken in order (the block is split).
- **Resize** (`resizeBlock`, admin → Departments → size): bigger → grow next to itself first, then elsewhere; smaller → give back free desks from the end of the block, never one someone sits at. Example: 5 → 2 with people at A-01 and A-04 keeps exactly those two. Only that department changes. Its hot-deskers get a desk in the block if one is now free.

### Decisions to know

1. **Reserved-but-empty desks of other departments are never borrowed**, to keep blocks intact. So a floor can go to hot desks at 97/100 desks used. The overview shows it honestly.
2. After growth, a department can own patches in several neighbourhoods (the "elsewhere" step). Moving it to a new floor tidies it into one block again.
3. **Blocks follow the snake, pods are separate areas.** In the v6 map the 25 desks of a neighbourhood are grouped in 5 desk **pods** (6, 4, 6, 4, 5 desks), and every pod is a **private area** for hearing. The snake runs across pods: pod-A1 holds A-01–A-03 and A-08–A-10, pod-A2 holds A-04–A-07. So in the demo, Riya (A-01), Arjun (A-02), Neha (A-03) and Design's Ananya (A-09) and Vikram (A-10) share pod-A1 and hear each other at their desks, while Kabir (A-04) and Sneha (A-05), also Engineering, sit in pod-A2 and can't hear Riya while seated. Each part of a department gets its own outline on the map. Known issue 7 in `docs/build-progress.md`.

---

## 4. Tiers 25 / 50 / 75 / 100

```js
// server/office/tiers.js
export function tierForHeadcount(headcount) {
  const needed = Math.ceil(Math.max(0, headcount) / DESKS_PER_WING); // 25
  return Math.min(WING_IDS.length, Math.max(1, needed));            // 1 … 4
}
```

| Headcount | 0–25 | 26–50 | 51–75 | 76–100 | > 100 |
|---|---|---|---|---|---|
| Tier | 1 | 2 | 3 | 4 | 4 (overflow → hot desks) |
| Open | A | A, B | A–C | A–D | A–D |

A floor's tier (`computeFloorTier`) is the largest of:

1. its previous tier (**it only grows**: if people leave, neighbourhoods stay open, so nobody is locked out of their desk),
2. `tierForHeadcount(people on the floor)`,
3. the tier of every neighbourhood that holds a used or reserved desk (example: a used desk in C opens tier 3 even with 17 people).

What "closed" means:

- **Drawn**: a light "dust sheet" with a red rope, brass posts and a "Neighbourhood C · Coming soon" sign (`officeOverlay.js`).
- **Browser**: not walkable (`isBlockedByOverlay` treats it as a wall).
- **Server**: a move whose avatar middle lands inside a closed neighbourhood is refused with `WING_CLOSED` (`isMoveIntoClosedWing` → `isWingClosed(floorId, wingAt(x, y))`). We never trust the browser.
- When a neighbourhood opens: an alert "Floor 1 grew to tier 2: wing B is now open.", and `office:update` to the floor, so open browsers redraw at once.

---

## 5. Hot desks and the "floor full" alert

Past the last free desk, new hires get hot desks H-01 … H-14 (the hot-desk room). The admin gets **one** open alert per floor, not one per person. Later overflow hires update its text and count:

> "Floor 1 is full: 10 people are on hot desks (latest: Isha Kapoor, Marketing, H-10). Add a floor or move a department to rebalance."

When a rebalance leaves a floor with no hot-deskers, its open "full" alerts resolve themselves.

---

## 6. Floors and rebalancing

Example (screenshots 19–22): Floor 1 has 107 people, tier 4, 10 on hot desks. The admin opens Floors → **Add Floor 2**, sets Engineering → Floor 2, clicks **Apply**.

1. `addFloor()` creates `floor-2` ("Floor 2", tier 1) and an alert "Floor 2 was added…". Its stored layout is created from the generated map the first time it is needed.
2. Apply sends `POST /api/admin/floors/apply { moves: [{ departmentId: 'dept-engineering', floorId: 'floor-2' }] }`.
3. `planRebalance` (pure, works on copies) for each moved department:
   1. its people stand up; their old desks and the old block are freed;
   2. on the new floor it reserves a block of `max(size, number of people)` neighbouring desks (an empty floor → starting at A-01);
   3. each person gets a desk there by the normal desk rule.
4. Then, on every floor people left, the remaining hot-deskers get a real desk where one is now free, by the desk rule (`reseated`).
5. The store saves everything, resolves the "full" alert if no hot-deskers remain, and emits the change.
6. Signaling moves every **online** member of the department to Floor 2 at once (`movePlayerToFloor`: hang up, leave the old room, appear at the elevator on Floor 2, `floor:changed`). Riya's office window switches floors by itself; Ctrl+D then finds her new desk.

Result in the screenshots: 55 people moved, 10 hot-deskers seated.

Every floor uses **the same floor plan** (`layout.json`); only the people, tiers and stored layout version differ.

People change floor themselves with the elevator (stand on it, press E) or the Floors button: `floor:change { floorId }`. On your own floor you start in the lobby; on another floor at the elevator.

---

## 7. Admin actions

All behind `requireAdmin` (admin token + role `admin`, checked on the server; see `01-auth-and-sso.md`). The admin page reloads every 5 s to show who is online.

| Section | What the admin does | Route | Server function |
|---|---|---|---|
| Overview | headcount, online, desks used / capacity (desks in open neighbourhoods), tier per floor, hot desks used, open alerts, a mini-map per floor | `GET /api/admin/overview` | `overview(online)` + `floorSnapshot` |
| Departments | add (name, colour, size, floor); rename, recolour, resize in the row | `POST` / `PATCH /api/admin/departments` | `addDepartment`, `updateDepartment` |
| Employees | add one (name, email, role, department), seated by the desk rule; "Add 10 sample employees" into a department | `POST /api/admin/employees`, `/sample` | `addEmployee`, `addSampleEmployees` |
| Floors | add the next floor; move departments between floors | `POST /api/admin/floors`, `/apply` | `addFloor`, `applyFloorMoves` |
| Alerts | list, resolve | `GET /api/admin/alerts`, `POST …/:id/resolve` | `resolveAlert` |
| Layouts | stored versions per floor, Download, Upload (Tiled JSON), Use generated | `GET /api/rooms`, `POST /api/rooms/:id/layout`, `/generated` | `server/geo/rooms.js` |

Input checks give clear errors with an HTTP status: empty name → 400; bad email → 400; email already in the directory → 409; unknown department → 404; colour not like `#2f80ed` → 400; size outside 1–100 → 400.

---

## 8. The generated map

The floor is drawn **by code**, not by hand: `node server/scripts/build-office-map.js`.

1. `office-map/plan.js` describes the floor: rooms with tile coordinates, types and floors, desk neighbourhoods, the lobby spawn tile, the elevator.
2. `office-map/builder.js` paints the tile layers: floors, dark wall tops with automatic 2-tile wall faces on the south side, doors, furniture "stamps", and the invisible `collision` layer.
3. `office-map/tiles.js` is the palette: only the three LimeZu tilesets already in the repo (taken from `office-base.json`, Anjali's original map).
4. A **flood fill** (spreading from the lobby to every reachable walkable tile) checks that every desk, hot desk and the elevator can be reached on foot. If not, the build stops with a clear message.
5. It writes `client/public/maps/office.json` (110 × 80 tiles, 3520 × 2560 px, about 147 KB; layers `floor`, `rugs`, `walls`, `furniture`, `decor`, `collision` + object layers `zones`, `spawn`) and `server/office/layout.json`.

`layout.json` holds: `spawn` (1632, 2104), `elevator` (2080, 1688), 4 neighbourhoods (448 × 672 px each), 100 desks (`{ id, wingId, index, row, col, pod, x, y, … }`, neighbours 64 px apart), 14 hot desks, 66 areas, labels and `mapHash`.

What is on the floor: Stage hall (platform, 8 rows of chairs), Boardroom (10–12), Meeting rooms 2–3 (6–8), Meeting rooms 4–7 (2–4), Focus rooms 1–2, 4 phone booths, 4 desk neighbourhoods, library lounge, café, kitchen with tea tables, lobby (reception, coffee bar, elevator), hot desks, a paved terrace. There are no grass tiles in the tilesets, so the "garden" is a terrace with potted trees.

Why generate instead of drawing in Tiled? The desks, areas and map must agree exactly (a desk's spot, its pod's area, the neighbourhood rectangle). Generating them from one plan keeps them in step; exporting from Tiled straight into `office.json` would not update `layout.json`.

---

## 9. Layout persistence and upload

Every floor has a stored layout in the `rooms` collection: `{ _id: floorId, map, desks, areas, version, source: 'generated' | 'uploaded', mapHash, updatedAt }`.

At start-up (`ensureGeneratedRoom`):

| Stored layout | What happens |
|---|---|
| none | store the generated one as version 1 |
| generated, same `mapHash` | keep it |
| generated, different `mapHash` (the generator changed) | store the new one as version + 1 |
| uploaded | keep it: the admin's upload wins over the generator |

Then the floor's areas go into the `areas` collection and are read back, so the tick's `$geoWithin` uses exactly the stored shapes.

Upload (Admin → Layouts → **Upload layout (Tiled JSON)**), `POST /api/rooms/:id/layout`:

1. Body up to 5 MB (the global JSON parser, 100 KB, skips this one route).
2. `validateTiledMap`: orthogonal; 32 × 32 px tiles; at most 128 × 128 tiles; tilesets embedded; tile layers `floor`, `walls`, `furniture`, `collision` with full data; object layers `zones` and `spawn`; a point named `spawn`; every zone with a valid `zoneType` and a `name`; a stage's `platform` as `"x1,y1,x2,y2"`. Problems → 400 with the list.
3. `areasFromTiledMap`: each zone rectangle → a `box` area, each polygon → a `polygon` area; rooms sorted before open areas.
4. Save as the next version, `source: 'uploaded'`, desks kept from the stored layout.
5. `onLayoutSaved`: replace the floor's areas (memory + `areas` collection), mark everyone on the floor as moved (so the next tick re-checks them), and send `layout:update { floorId, version }`. Open browsers load `GET /api/rooms/:floorId` again and redraw.

**Use generated** (`POST /api/rooms/:id/generated`) stores the generated layout as the next version.

`rooms-test.js` (14 checks): load, 404, 401 without a token, 403 for employees, three kinds of bad upload, a valid upload → new version + `layout:update` + the new area works at once (two robots 216 px apart inside it → connected, `full`), back to generated.

Limits: an uploaded map **keeps the generated desks, spawn and elevator** (desks belong to the directory). A map that moves desks would put people at the old spots; changing desks needs the generator (`plan.js`).

---

## 10. Resetting the demo

The walkthrough's growth and floor steps, and `floor-test.js`, really change the directory. Before a demo:

```bash
node server/office/reset-demo.js --yes   # deletes all employees, departments, floors, alerts; re-seeds
# then restart the server (it loads the office at start-up)
```

Without `--yes` it refuses, because it deletes data. It needs `MONGODB_URI` and uses whatever database that points at, so check it before running.
