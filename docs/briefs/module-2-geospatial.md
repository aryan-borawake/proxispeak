# Module 2 — Geospatial Engine

**For: Person 2.** Owner: ________

> **How to read this brief.** Sections 1–5 explain your module. Section 6 is your plan: read each task on the day the calendar gives it, not all at once. The appendix at the end is written for your AI tool, so you can skip it.

---

## 1. What this module does

Your module answers one question, very fast: **"who is near whom?"**

**Example.** Riya stands at x = 340, y = 210. Sam is at x = 395, y = 230. Priya is far away at x = 900, y = 600.

- Distance from Riya to Sam: about 58 pixels. That's within 100 px, so they should hear each other.
- Distance from Riya to Priya: about 680 pixels. Far too far.

Four times a second, the server hands your module a list of people who moved:

```js
[{ id: 'riya', x: 340, y: 210 }, { id: 'sam', x: 395, y: 230 }]
```

Your module then does three things:

1. **Saves** all of them into the MongoDB database in one go (one trip to the database, not one per person).
2. **Asks** the database, for each person: "who is within 140 pixels of them?"
3. **Decides** who just came close (within 100 px → start a voice connection) and who just walked away (beyond 140 px → end it).

Person 1's server sends your answers to the browsers. You never deal with browsers, the microphone or sound.

**Why the database and not plain maths?** Infotact's spec asks for MongoDB's geospatial queries, and the mid review checks that this answer takes **under 20 milliseconds**. You prove that number.

---

## 2. Where your module fits

1. Person 1's server keeps everyone's live position in its memory.
2. Four times a second, it calls **your** functions with the people who moved.
3. You return "who came close" and "who walked away".
4. Person 1's server tells the browsers, and they start or end voice connections.

In Weeks 3–4, you also store the office's zones (meeting rooms, focus room, stage) and the saved office maps.

---

## 3. Your folder

Everything you write lives in `server/geo/`:

| File | What it does |
|---|---|
| `db.js` | Connects to the database |
| `models/Position.js` | Describes what a saved position looks like, and adds the index that makes searching fast |
| `geoEngine.js` | Saves positions, finds nearby people, removes people who leave |
| `peerChanges.js` | The "came close / walked away" rule |
| `index.js` | The list of functions other modules may use |
| `scripts/` | Small programs you run yourself: fill the database with fake users, test, measure speed |
| Later: `models/Zone.js`, `models/Room.js`, `routes.js` | Weeks 3–4 |

**Not yours:** everything outside `server/geo/`. The file that starts the server (`server/index.js`) belongs to Person 1. When your code is ready, tell him and he plugs it in.

---

## 4. Words you need

| Word | Plain meaning |
|---|---|
| Database | A program that stores data permanently and lets you search it |
| MongoDB | The database we use. It stores data as JavaScript-like objects |
| Document | One saved record, e.g. `{ _id: 'riya', loc: [340, 210] }` |
| Collection | A group of documents of the same kind, like a table. Ours is called `positions` |
| Query | A question you ask the database, e.g. "who is near this point?" |
| Mongoose | A library that lets our Node code talk to MongoDB easily |
| Schema | A description of what a document must look like (which fields, which types) |
| Model | The object Mongoose gives you to save and search documents of one schema |
| Local MongoDB | MongoDB installed on your own laptop. Free, with no speed limit |
| MongoDB Compass | A free app that lets you look inside the database, like a file explorer |
| Atlas | MongoDB's cloud hosting. Its free tier (a free **cluster**, meaning a small database server) allows about 100 operations a second |
| Connection string | The address and password the code uses to reach the database. It goes in `.env`, never in code |
| `.env` | A local file holding secrets. It is never committed |
| Coordinates | The x, y numbers of a position. We store them as `[x, y]`, x first |
| Index | A shortcut the database keeps so it can find data without checking every record, like the index at the back of a book |
| 2d index | An index for flat x, y points (our office map is flat) |
| Bounds | The smallest and largest numbers the 2d index accepts. Ours is 0 to 4096 |
| `$near` | A MongoDB query: "find documents near this point, closest first" |
| `$maxDistance` | Added to `$near`: "only within this many pixels" |
| `$geoWithin` | A MongoDB query: "find documents inside this shape", e.g. inside a meeting-room rectangle (Week 3) |
| `bulkWrite` | Many saves sent to the database in one trip |
| Upsert | "Update this document if it exists, otherwise create it" |
| Script | A small program you run from the terminal, e.g. `node scripts/seed-fake-users.js` |
| Seed | Fill the database with test data |
| Pure function | A function that only uses its inputs (no database, no network), so it's easy to test |
| Test case | One example with a known right answer, used to check your code |
| Connect/disconnect gap | Connect at 100 px, disconnect only beyond 140 px, so people at the edge don't flicker on and off |
| `performance.now()` | A very precise stopwatch in JavaScript, measured in milliseconds |
| ms | Millisecond, a thousandth of a second |
| Average / maximum | The typical time / the slowest time. Reviewers care about both |
| Parallel / `Promise.all` | Run many queries at the same time instead of one after another |
| `.explain()` | Asks MongoDB to show how it answered a query, including whether it used your index |
| Tick | A job that repeats on a timer. Person 1's tick calls your code every 250 ms |
| Route / API | A web address the app can call to load or save data, e.g. `GET /api/rooms/office-1` |
| Deploy | Put the app on the internet so anyone can open it with a link |

---

## 5. Working alone

You need only your laptop:

- **Local MongoDB** and **Compass** to store and look at data.
- **Scripts** to test everything. Each feature gets a script you can run that prints PASS or FAIL, or a table of timings.

You never need a browser, the server, or anyone else's code. You only need Person 1 on handover day (Wed 21 Oct).

---

## 6. Your two weeks

**Commit messages.** The word before the colon says what kind of change it is: `feat` = new feature, `fix` = bug fix, `docs` = documentation, `test` = test, `perf` = speed improvement. The word in brackets is your module. Example: `feat(geo): nearby query`.

**Integration days** (Wed 21 and Sat 24 Oct): open a pull request from your branch into `dev` in the morning. Sat 17 Oct is a setup check: your branch exists and your work runs on your laptop.

### Calendar

Tasks are numbered. This calendar says which day to do each one. If the plan slips again, only this table changes.

| Date | Do these tasks | Notes |
|---|---|---|
| Fri 16 Oct | 1 | Create your branch from `main`; start your log |
| Sat 17 Oct | 2, 3 | Setup check |
| Sun 18 Oct | 4 |  |
| Mon 19 Oct | 5 |  |
| Tue 20 Oct | 6, 7 |  |
| Wed 21 Oct | 8, 9 | **Integration #1:** pull request into `dev` in the morning; hand over to Person 1 |
| Thu 22 Oct | 10 |  |
| Fri 23 Oct | 11 |  |
| Sat 24 Oct | 12 | **Integration #2 + mid freeze:** pull request in the morning |
| Sun 25 Oct | 13 |  |
| Mon 26 Oct | 14 |  |

### Task by task

**Task 1: set up MongoDB.**
- Build: install local MongoDB and Compass. Create a free Atlas cluster. Write `db.js`, which reads the connection string from `.env`, connects, and prints "connected". Create your log.
- Why: everything else needs a database.
- Done when: running the code prints "connected".
- Commit: `feat(geo): database connection`

**Task 2: describe a saved position.**
- Build: a `Position` schema with the user id, the room name, the location `[x, y]` and the time it was saved. Add a 2d index on the location, with bounds 0 to 4096.
- Why: the index is what makes "who is near?" fast.
- Done when: Compass shows the `positions` collection with the index.
- Commit: `feat(geo): position schema with 2d index`

**Task 3: fake users.**
- Build: `scripts/seed-fake-users.js`, which puts N fake users at random spots (you choose N when you run it, e.g. 50).
- Why: you need data to search, and you can't wait for real users.
- Done when: running it with 50 shows 50 documents in Compass.
- Commit: `feat(geo): fake user seed script`

**Task 4: your first "who is near?"**
- Build: `findNearby(userId, maxDistancePx)`, which finds people within that distance, in the same room, without including the person themselves. It returns each person's id and distance.
- Why: this is the heart of your module.
- Done when: it returns sensible results on your fake users.
- Commit: `feat(geo): nearby query with $near`

**Task 5: a test with known distances.**
- Build: `scripts/test-nearby.js`, which places users at distances you know (50, 99, 101 and 150 px) and checks your function gets exactly the right ones.
- Why: a test with known answers proves your code is right, not just "looks right".
- Done when: the script prints PASS for every case.
- Commit: `test(geo): nearby query checks`

**Task 6: save many positions in one trip.**
- Build: `upsertPositions(users)` saves everyone who moved using one `bulkWrite`. Also write `removeUser(userId)` for people who leave.
- Why: 50 separate saves four times a second would hit the Atlas limit; one batch doesn't.
- Done when: saving 50 users makes one database call.
- Commit: `feat(geo): batch position writes`

**Task 7: the "came close / walked away" rule.**
- Build: `computePeerChanges` (worked example in the appendix). It's a pure function, so write test cases for it: someone at 80 px enters; someone connected at 120 px stays; someone not connected at 120 px doesn't enter; someone beyond 140 px leaves.
- Why: this gap stops connections flickering at the edge.
- Done when: all your test cases pass.
- Commit: `feat(geo): connect/disconnect rule`

**Task 8: package it and hand over.**
- Build: `createGeoEngine`, which bundles your functions. Check the names match `CONTRACTS.md` exactly, then tell Person 1 it's ready.
- Done when: Person 1 confirms he can import it.
- Commit: `feat(geo): geo engine API`

**Task 9: prove the index is used.**
- Build: run `.explain()` on your query and find `GEO_NEAR_2D` in the output, which means MongoDB used your index. Note it in your log.
- Why: reviewers may ask "how do you know it's fast because of the index?"
- Commit: `docs(geo): index usage proof`

**Task 10: the speed test.**
- Build: `scripts/spatial-audit.js` puts 50 fake users in the database, runs your query for each one, times each with `performance.now()`, and prints the average and the slowest time.
- Why: this is the mid review "Spatial Audit": prove it takes under 20 ms.
- Done when: it prints a clear table.
- Commit: `feat(geo): spatial audit script`

**Task 11: speed test version 2.**
- Build: repeat the test 10 times. Also time a whole tick: one batch save plus 50 queries run in parallel. Save the results table in `docs/geo-audit.md`.
- Why: one lucky run proves little; ten runs are convincing.
- Commit: `perf(geo): full tick timing`

**Task 12: survive database errors (mid freeze).**
- Build: if the database is down, log the problem and skip that tick instead of crashing the whole server. From now until the review, only fixes.
- Commit: `fix(geo): survive database errors`

**Task 13: explain it.**
- Build: `docs/geo.md`: how your module works, in your own words, with Riya and Sam's example worked through.
- Commit: `docs: geo module explanation`

**Task 14: rehearsal.**
- Build: practise running the speed test live. Write viva notes in your log.
- Commit: `docs: viva notes`

---

## 7. Mid review: what you show

Run `node server/geo/scripts/spatial-audit.js` live: 50 users, every "who is near?" query under 20 ms. Then show the `.explain()` output proving the index is used.

---

## 8. Weeks 3–4

**Week 3: zones**
- Store zones (meeting room, focus room, stage, lobby) in a new `zones` collection. Each zone is a rectangle with a type.
- Read the zones from the office map file that Person 3 makes (read it only; never edit it). Until it's ready, write one test zone by hand.
- For each zone, use `$geoWithin` to find who is inside it.
- `canHear(a, b)`: a pure function that applies the zone rules (same private room → full volume; silent room → nobody; and so on). Test every rule.

**Week 4: saving office maps (the spec's "Room Persistence")**
- Save the whole office map (layout, furniture, walls, zones) in MongoDB.
- Add two web addresses: one to load a saved office, one to save it. Person 1 connects them to the server.
- Add the stage rule.
- Put the database and the server online (Atlas and Render), together with Person 1.
- Optional, if time allows: build a version that finds nearby people without the database and compare its speed with `$near`.

---

## 9. Final review: what you show

Zones loaded from the database: walk into the meeting room and the people outside go silent. Change a room's size in the saved map and it works with no code change.

---

## 10. Viva questions, with short answers to build on

| Question | Short answer |
|---|---|
| What does a 2d index do? | It lets MongoDB jump straight to nearby points instead of checking every user |
| Why "2d" and not "2dsphere"? | 2dsphere is for latitude and longitude on a round Earth; our office is a flat grid of pixels |
| Why save positions in one batch every 250 ms? | 50 users × 10 moves a second would be 500 saves a second; batching keeps us far below the Atlas limit |
| Why two numbers, 100 and 140 px? | So people standing at the edge don't connect and disconnect several times a second |
| How did you measure "under 20 ms"? | `performance.now()` around each query, 50 users, 10 rounds, average and slowest |
| What's the difference between `$near` and `$geoWithin`? | `$near` = "who is close to this point"; `$geoWithin` = "who is inside this shape" |

---

## 11. Mistakes to avoid

- The 2d index only accepts -180 to 180 unless you set bounds. Our pixels go up to 4096, so set the bounds 0 to 4096, or saving fails.
- Coordinates are `[x, y]`, x first.
- `$near` doesn't tell you the distance. Calculate it yourself with `Math.hypot(dx, dy)` (the straight-line distance).
- Run the 50 queries in parallel, not one after another.
- Never put the Atlas connection string in code.
- Run speed tests on local MongoDB. The Atlas free tier's limit would make the numbers look worse than your code really is.

---

## Appendix: for your AI tool

The exact names live in `CONTRACTS.md`. This is a summary.

```js
// server/geo/index.js
export async function connectDb(uri) {}

export function createGeoEngine({ roomId }) {
  return {
    upsertPositions: async (users) => {},            // users: [{ id, x, y }] → one bulkWrite of upserts
    findNearby: async (userId, maxDistancePx) => [], // → [{ id, distance }], closest first, excludes userId
    removeUser: async (userId) => {},
  };
}

export function computePeerChanges(currentPeerIds, nearby, { connectPx, disconnectPx }) {}
// currentPeerIds: Set. Returns { entered: [id], left: [id] }.
// Example: current {u2, u3}; nearby [{ id: 'u2', distance: 120 }, { id: 'u4', distance: 80 }]
// → { entered: ['u4'], left: ['u3'] }   (u2 stays: already connected and within 140)

// Position schema: { _id: String (user id), roomId: String, loc: [Number, Number], updatedAt: Date }
// Index: { loc: '2d', roomId: 1 } with { min: 0, max: 4096 }
// PLANNED Week 3: usersInZone(zone) via $geoWithin { $box }; canHear(a, b) → { audible, mode }
```
