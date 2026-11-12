# 12 — Redis and running several server copies

> **NOT YET MERGED.** Nothing in this file exists on branch `aryan` today. No code reads `REDIS_URL` (it is commented out in `.env.example`), and `server/` has no Redis code. Another session is building Redis in a separate folder. This page holds only the **planned design**, from `docs/briefs/module-1-signaling-webrtc.md`, `docs/planning/team-briefing.md` and `docs/work-distribution.md`. Replace it with the real design once that work is merged, and fill in the matching section of `02-signaling-and-tick.md` (section 12, "Redis (multi-server) — TO BE ADDED").

If asked in the viva today, the honest answer is: "Redis is designed and planned, not built on this branch. Today ProxiSpeak runs as one server process."

---

## 1. The problem

Example: the server runs as two copies, A and B, behind one address. Riya's browser happens to connect to copy A, Sam's to copy B. They stand 40 px apart.

- Copy A's players Map holds Riya only; copy B's holds Sam only.
- A's 100 ms broadcast sends Riya's position to "everyone in `floor-1`", but Socket.io on A only knows the sockets connected to A. Sam never sees Riya move.
- A's tick never finds Sam near Riya, so they never get `peers:update`, and they never hear each other.

Everything that lives in **one process's memory** breaks:

| In memory today | File |
|---|---|
| the players Map (positions, `moved` flags) | `server/signaling/players.js` |
| peer sets and modes | `server/signaling/tick.js` |
| Socket.io rooms (who is on which floor) | Socket.io itself |
| the office directory (employees, departments, floors) | `server/office/store.js` |
| each floor's areas | `server/signaling/roomAreas.js` |

Why run two copies at all? One Node process uses one CPU core and has its limits; the spec asks for the system to work for 50+ users with "two server copies sharing users through Redis" (module 1 brief, Week 3 and the final checkpoint).

---

## 2. The planned tool

**Redis** is a very fast data store that keeps everything in memory (RAM). It can also pass messages between programs: **Pub/Sub** (publish/subscribe), where one program publishes a message on a channel and every program subscribed to that channel receives it. The team briefing compares it to "a shared WhatsApp group between the servers".

The **Socket.io Redis adapter** is a Socket.io plug-in that uses Redis Pub/Sub so that `io.to('floor-1').emit(...)` on copy A also reaches the sockets in `floor-1` that are connected to copy B.

Planned hosting (team briefing): own laptops for development; Upstash or Render for the deployed version. Upstash's free tier (500 000 commands a month, as checked 12 Oct 2026) is fine for demos but not for long load tests.

---

## 3. The design question the brief leaves open

The adapter fixes **messages**. It does not fix **state**: the tick on copy A still can't see the players held by copy B. The brief says to "settle one design question in the Week 3 chat: positions live in each copy's memory, so the copies must share them somehow". The usual options, for the merged design to choose from:

| Option | Idea | Trade-off |
|---|---|---|
| Shared positions in MongoDB | every copy writes its movers in its own tick (it already does: `upsertPositions`); `$near` and `$geoWithin` then see everyone | the database already holds positions; but each copy's peer sets must still agree, and two copies deciding the same pair can disagree |
| One tick owner per floor | only one copy runs the tick for a given floor; it reads all positions (MongoDB or Redis) and publishes `peers:update` through the adapter | one decider, so peer sets stay consistent; needs a way to pick the owner and take over if it dies |
| Positions in Redis | each copy writes positions to Redis; the tick reads them from there | fastest shared store; a second store to run |
| Sticky sessions only | the load balancer sends all people of one floor to the same copy | simplest; but a floor can't be bigger than one copy, and the elevator would have to move people between copies |

Also needed in any option:

1. **Sticky sessions** for Socket.io's polling fallback: one browser's requests must keep reaching the same copy.
2. **The office directory** must be shared or reloaded: an admin change on copy A must reach copy B (today `officeEvents` is in-process only).
3. **Signal relay** (`rtc:signal`) must check peers that the other copy owns, and deliver to a socket on the other copy (the adapter does the delivery).

---

## 4. What will need explaining once it is merged

Placeholders for the real answers:

1. Which option was chosen, and why. — *TO BE ADDED*
2. Where positions, peer sets and modes live. — *TO BE ADDED*
3. Who runs the tick for each floor. — *TO BE ADDED*
4. How the directory and layouts stay in step across copies. — *TO BE ADDED*
5. How it was tested (two copies on two ports, a user on each, they hear each other). — *TO BE ADDED*
6. The new environment variable(s) and where they are read. — *TO BE ADDED*
