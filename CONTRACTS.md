# ProxiSpeak Contracts

**v5 — 12 Nov 2026** (the Infotact office: sign-in, floors, desks by department, status, admin — see the new sections 4b, 7b, 9b and 13)

This file is the single source of truth for how the four modules talk to each other: every event name, payload, function, database shape and file format. If your code and this file disagree, this file wins.

---

## 1. How to read this file, and how to request a change

**How to read it.** Find your module in sections 6–7 and implement exactly those names, arguments and return shapes. Sections 3–5 tell you what the other modules send you. You don't need to read the rest every day.

- A **contract** is a promise between two pieces of code: "I will call you with this, and you will give me back that."
- A **payload** is the data inside an event, e.g. `{ x: 340, y: 210, dir: 'right' }`.
- **PLANNED** means "not built yet, and the details may still change". Don't build PLANNED parts before their week.

**How to request a change.** Example: Person 4 needs `frame` to include each person's name.

1. Don't edit this file or `shared/` yourself, even if it's a one-word change.
2. Message Person 1 in the group: what you want changed, and why.
3. Person 1 updates this file and `shared/`, bumps the version line at the top (v1 → v2), adds a line to the change log (section 12), and announces it in the group.
4. Everyone uses the new version from then on.

The real numbers and names live in code in `shared/constants.js` and `shared/events.js`. Always import them; never type them yourself.

---

## 2. Conventions

- **Units.** All positions and distances are in **pixels** (px). All times are in **milliseconds** (ms).
- **Coordinates.** The origin `(0, 0)` is the **top-left** corner of the map. **x grows to the right, y grows down.** Example: `{ x: 340, y: 210 }` is 340 px from the left edge and 210 px from the top. Valid values are `0` to `WORLD_MAX_PX` (4096).
- **User id.** For now, a user's id is their Socket.io socket id (a random string such as `'kX9a2bQ...'`). The server creates it; browsers never choose their own id.
- **Room.** Labs and robot tests (a `{ name }` join) use one room, `DEFAULT_ROOM` = `'office-1'`. v5: a signed-in employee (a `{ token }` join) is in the room of their **floor**; the room id is the floor id, e.g. `'floor-1'`. Broadcasts, the proximity tick and the geo engine are per room, so people on different floors never see or hear each other.
- **Directions.** `dir` is one of `'up'`, `'down'`, `'left'`, `'right'` (`DIRECTIONS`).
- **Distance.** Straight-line distance: `Math.hypot(b.x - a.x, b.y - a.y)`.
- **Imports.** Server: `import { EVENTS } from '../shared/events.js'` (adjust the `../` to your file's depth). Client: `import { EVENTS } from '@shared/events.js'`.
- **Settings and secrets** go in the `.env` file in the repo root (copy `.env.example`). It is never committed.

---

## 3. Constants (`shared/constants.js`)

| Name | Value | Meaning |
|---|---|---|
| `EARSHOT_PX` | `100` | Connect within this distance; volume reaches 0 here |
| `DISCONNECT_PX` | `140` | Disconnect only beyond this (stops flicker at the edge) |
| `MAX_PEERS` | `8` | Nearest-N connection cap, used from Week 3 |
| `MOVE_SEND_HZ` | `10` | The browser sends its position at most 10 times a second |
| `STATE_BROADCAST_MS` | `100` | The server broadcasts all positions every 100 ms |
| `PROXIMITY_TICK_MS` | `250` | The server checks "who is near whom?" every 250 ms |
| `TILE_SIZE` | `32` | One map tile is 32 × 32 px |
| `WORLD_MAX_PX` | `4096` | Largest x or y; also the 2d index bound |
| `DEFAULT_ROOM` | `'office-1'` | The one room for now |
| `DEFAULT_SPAWN` | `{ x: 200, y: 200 }` | Where new people appear (placeholder until the map's lobby is final) |
| `DIRECTIONS` | `['up', 'down', 'left', 'right']` | Directions an avatar can face |
| `ZONE_TYPES` | `{ OPEN: 'open', PRIVATE: 'private', SILENT: 'silent', STAGE: 'stage', LOBBY: 'lobby' }` | Kinds of zone on the map |
| `AUDIO_MODES` | `{ FALLOFF: 'falloff', FULL: 'full' }` | `falloff` = quieter with distance; `full` = full volume |
| `ERROR_CODES` | `{ BAD_NAME, ALREADY_JOINED, NOT_JOINED, BAD_MOVE, BAD_SIGNAL }` (each value is the same text as its name, e.g. `'BAD_MOVE'`) | The `code` in `SERVER_ERROR`. `BAD_NAME` = join had a missing or empty name. `ALREADY_JOINED` = this tab has already joined. `NOT_JOINED` = sent something (e.g. a move) before joining. `BAD_MOVE` = a move had a bad `x`, `y` or `dir`, so it was ignored. `BAD_SIGNAL` = a `SIGNAL` had a bad shape, or its `to` is not online or not within earshot (not in the sender's peer set), so it was not delivered |

v5 adds (the Infotact office):

| Name | Value | Meaning |
|---|---|---|
| `ERROR_CODES` (new codes) | `BAD_TOKEN`, `BAD_STATUS`, `BAD_FLOOR`, `WING_CLOSED` | `BAD_TOKEN` = a join token was missing, forged or expired, or its employee is gone. `BAD_STATUS` = a status not in `STATUSES`. `BAD_FLOOR` = a floor change to a floor that does not exist, or from a `{ name }` join. `WING_CLOSED` = a move into a wing that is not open yet (it is ignored) |
| `STATUSES` | `{ AVAILABLE: 'available', BUSY: 'busy', DND: 'dnd' }` | A person's status. `dnd` (Do Not Disturb): the server keeps them out of every peer set (no voice either way) |
| `ROLES` | `{ ADMIN: 'admin', DIRECTOR: 'director', LEAD: 'lead', EMPLOYEE: 'employee', INTERN: 'intern' }` | Directory roles; only `admin` may use the admin routes (with an admin token) |
| `WING_IDS` | `['A', 'B', 'C', 'D']` | The four desk wings of a floor, in opening order |
| `DESKS_PER_WING` | `25` | Desks per wing |
| `FLOOR_CAPACITY` | `100` | Desks per floor (4 × 25) |
| `DEFAULT_FLOOR_ID` | `'floor-1'` | The first floor; also its room id |
| `TOKEN_TTL_MS` | `43200000` (12 h) | How long a sign-in token works |
| `AVATAR_COLORS` | six hex colours | The colours a person can pick in the lobby |
| `ALERT_TYPES` | `{ FLOOR_FULL: 'floor-full', WING_OPENED: 'wing-opened', FLOOR_ADDED: 'floor-added' }` | Kinds of admin alert |

**Tiers.** A floor's tier is its number of open wings: tier 1 = A (up to 25 people), 2 = A + B (50), 3 = A–C (75), 4 = A–D (100). It is the smallest tier that fits the floor's headcount and every wing that holds a used or reserved desk, and it only grows.

All objects and arrays are frozen with `Object.freeze`, so code can't change them by accident.

---

## 4. Events (`shared/events.js`)

Use the constant (`EVENTS.MOVE`), never the string (`'player:move'`).

| Constant | String | Direction | Payload | How often |
|---|---|---|---|---|
| `JOIN` | `'player:join'` | browser → server | `{ name }` | once |
| `WORLD_INIT` | `'world:init'` | server → that browser | `{ selfId, roomId, spawn: { x, y }, players: [{ id, name, x, y, dir }] }` | once, reply to join |
| `PLAYER_JOINED` | `'player:joined'` | server → everyone else in the room | `{ id, name, x, y, dir }` | when someone joins |
| `MOVE` | `'player:move'` | browser → server | `{ x, y, dir }` | at most 10/sec, only when moved |
| `PLAYERS_STATE` | `'players:state'` | server → everyone in the room | `{ t, players: [{ id, x, y, dir }] }` | every 100 ms |
| `PLAYER_LEFT` | `'player:left'` | server → everyone in the room | `{ id }` | on disconnect |
| `PEERS_UPDATE` | `'peers:update'` | server → one browser | `{ entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }` | when something changes (checked every 250 ms) |
| `SIGNAL` | `'rtc:signal'` | browser → server → browser | sent `{ to, data }`; delivered `{ from, data }`; `data` is `{ type: 'offer' \| 'answer', sdp }` or `{ type: 'candidate', candidate }` | during handshakes |
| `SERVER_ERROR` | `'server:error'` | server → one browser | `{ code, message }` | on bad input |

In Weeks 1–2, `mode` is always `'falloff'` and `changed` is always empty.

v5 changes to the events above (old payloads keep working):

- `JOIN` may be `{ token, avatarColor?, floorId?, status? }` instead of `{ name }`. The server checks the token (section 9b), takes the name from the directory, and joins the room of `floorId` (if it exists) or else the employee's own floor. Spawn: the lobby (`layout.spawn`) on your own floor, the elevator on another floor. A bad token → `SERVER_ERROR` `BAD_TOKEN`.
- `WORLD_INIT` for a token join also has `profile` (see `GET /api/me`) and `office` (the floor snapshot, same shape as `OFFICE_UPDATE`). Every entry of `players` (and every `PLAYER_JOINED`) also has `status`, and for signed-in employees `employeeId`, `role`, `avatarColor`, `department: { id, name, color }`.
- `PLAYERS_STATE` is sent per room and lists only that room's players.
- `MOVE` into a closed wing of your floor → `SERVER_ERROR` `WING_CLOSED`, the move is ignored.

## 4b. Events added in v5

| Constant | String | Direction | Payload | When |
|---|---|---|---|---|
| `PLAYER_STATUS` | `'player:status'` | browser → server | `{ status }` (one of `STATUSES`) | when I change my status |
| `PLAYER_STATUS` | `'player:status'` | server → everyone in the room | `{ id, status }` | after a status change |
| `OFFICE_UPDATE` | `'office:update'` | server → everyone on one floor | `{ floorId, name, tier, openWings: ['A', …], headcount, departments: [{ id, name, color, wingId, deskIds }], hotDeskIds: [id], floors: [{ id, name }] }` | when the admin changes something on that floor (a wing opened, a department added / resized / moved) |
| `FLOOR_CHANGE` | `'floor:change'` | browser → server | `{ floorId }` | the elevator (E) or the Floors button |
| `FLOOR_CHANGED` | `'floor:changed'` | server → one browser | same shape as `WORLD_INIT` (`selfId` stays the same) | after `FLOOR_CHANGE`, or when the admin moved my department to another floor |

**Do Not Disturb.** Turning on `dnd` makes the server hang up all of that player's peers at once (both sides get `PEERS_UPDATE` `left`); while `dnd`, the tick never puts them in anyone's peer set. Back to `available` / `busy`: the next tick connects them to whoever is near.

**Changing floor.** The server: hangs up all the player's peers (both sides get `left`), removes them from the old room's geo engine, sends `PLAYER_LEFT` to the old room, joins the new room at the elevator spot, sends `FLOOR_CHANGED` to them and `PLAYER_JOINED` to the new room. The browser rebuilds its rtc manager and remounts `WorldCanvas`.

In `SERVER_ERROR`, `code` is always one of `ERROR_CODES` (section 3).

In `PLAYERS_STATE`, `t` is the server's clock time in ms when it sent the message (`Date.now()`). The world uses it to slide other characters smoothly.

**Example.** Riya joins, then walks right:

```
browser → server   player:join     { name: 'Riya' }
server → Riya      world:init      { selfId: 'a1', roomId: 'office-1', spawn: { x: 200, y: 200 }, players: [] }
browser → server   player:move     { x: 204, y: 200, dir: 'right' }
server → everyone  players:state   { t: 1760781234567, players: [{ id: 'a1', x: 204, y: 200, dir: 'right' }] }
```

---

## 5. Signaling rules

**Signaling** means passing WebRTC setup notes (offer, answer, ICE candidates) between two browsers through our server before their direct voice connection starts.

1. **Who sends the offer.** The person whose id is smaller (plain string comparison, `idA < idB`) creates the offer. The other only answers. Example: `'a1' < 'b7'`, so `a1` sends the offer. This stops "glare" (both sending offers at once).
2. **The server never trusts `from`.** It checks that `to` is a connected user (if not, it sends `SERVER_ERROR`), and it writes `from` itself from the sender's socket id.
3. **Queue early ICE candidates.** Candidates that arrive before the remote description is set wait in a queue, and are added once it is set.
4. **On `left`, both sides close.** When `PEERS_UPDATE` lists someone in `left`, both browsers close and remove that connection.
5. **Relay only within earshot.** The server relays a `SIGNAL` only if the receiver is currently in the sender's peer set (within earshot); otherwise it replies `SERVER_ERROR` with `BAD_SIGNAL`.
6. **(v5) Same room, not DND.** Two players are only ever peers when they are in the same room (floor) and neither has status `dnd`, so rule 5 also stops notes across floors and to/from DND players.

---

## 6. Server module interfaces

```js
// server/geo/index.js (Person 2)
connectDb(uri)                                   // → Promise
createGeoEngine({ roomId })                      // → { upsertPositions, findNearby, removeUser }
  upsertPositions(users)                         // users: [{ id, x, y }] → Promise; one bulkWrite with upserts
  findNearby(userId, maxDistancePx)              // → Promise<[{ id, distance }]>, closest first, excludes userId
  removeUser(userId)                             // → Promise
computePeerChanges(currentPeerIds, nearby, { connectPx, disconnectPx })
                                                 // pure; currentPeerIds: Set; → { entered: [id], left: [id] }
// PLANNED Week 3: usersInZone(zone) via $geoWithin; canHear(a, b) → { audible, mode }

// server/signaling/index.js (Person 1)
attachSignaling(io, { geo, createGeoEngine })    // v5: createGeoEngine (optional) makes one engine per
                                                 // floor room; → { getOnlineEmployeeIds() → Set }

// server/office/ (Person 1, v5) — the Infotact directory, in memory, saved to MongoDB on change
loadOffice()                                     // → Promise; at start-up, after the geo engine connected
store: getEmployee(id), findEmployeeByEmail(email), floorSnapshot(floorId), profileOf(employee),
       isWingClosed(floorId, wingId), addEmployee, addSampleEmployees, addDepartment, updateDepartment,
       addFloor, applyFloorMoves(moves), resolveAlert, overview(onlineIds); officeEvents 'change'
desks.js (pure):   chooseDesk({ desks, hotDesks, departments, employees, departmentId })
                   → { kind: 'own-block'|'grown'|'elsewhere'|'hot-desk'|'floor-full', deskId, hotDesk, departmentDeskIds }
                   reserveBlock({ desks, departments, employees, size }) → deskIds
                   resizeBlock({ desks, departments, employees, departmentId, newSize }) → deskIds
tiers.js (pure):   tierForHeadcount(n), openWingsForTier(t), tierOfWing(id), computeFloorTier({ previousTier, headcount, usedWingIds })
rebalance.js (pure): planRebalance({ desks, hotDesks, departments, employees, moves })
                   → { departments, employees, moved: [{ employeeId, fromFloorId, toFloorId }], reseated: [id] }

// server/auth/ (Person 1, v5)
createToken(claims, secret, ttlMs) / verifyToken(token, secret)   // HMAC-SHA256, Node crypto
requireEmployee / requireAdmin                                     // Express middleware
```

**The desk rule** (`chooseDesk`), in order: a free desk in the department's own block → grow the block into the free desk right next to it (same wing) → a free, unreserved desk anywhere else on the floor, wings in opening order (it joins the block; it may open the next wing) → a free hot desk (`hotDesk: true`, one open "Floor N is full" alert per floor) → `floor-full` (no desk). Desks in a wing are numbered in a snake, so desk n and n + 1 are always neighbours.

- `connectDb(uri)` does **not** read `.env` itself. The caller (`server/index.js`, or Person 2's scripts) loads `.env` from the repo root and passes `process.env.MONGODB_URI`. Example: `await connectDb(process.env.MONGODB_URI)`.
- `findNearby` only returns people in the same room, and never the user themselves.
- `computePeerChanges` is a **pure function**: it only uses its inputs (no database, no network), so it's easy to test.
  - Someone **not** connected and at distance ≤ `connectPx` → `entered`.
  - Someone connected and at distance > `disconnectPx`, or missing from `nearby` → `left`.
  - Anything else stays as it is.
- `attachSignaling(io, { geo })`: `geo` is the engine from `createGeoEngine()`, or `null` until Person 1's Task 9 (until then Person 1 uses a fake "who is near" check with the same answer format).

### Worked example: `computePeerChanges`

```js
computePeerChanges(
  new Set(['u2', 'u3']),                                        // connected to u2 and u3 now
  [{ id: 'u2', distance: 120 }, { id: 'u4', distance: 80 }],     // findNearby(id, DISCONNECT_PX)
  { connectPx: EARSHOT_PX, disconnectPx: DISCONNECT_PX },        // 100 and 140
);
// → { entered: ['u4'], left: ['u3'] }
```

- `u4` is at 80 px and not connected yet: 80 ≤ 100, so **entered**.
- `u2` is at 120 px and already connected: 120 ≤ 140, so it **stays** (not listed).
- `u3` is connected but not in `nearby` (farther than 140 px), so **left**.

### The proximity tick (Person 1 runs it, every `PROXIMITY_TICK_MS` = 250 ms)

1. Collect the users who moved since the last tick.
2. Call `geo.upsertPositions(moved)` once.
3. For each moved user, in parallel (`Promise.all`), call `geo.findNearby(id, DISCONNECT_PX)`.
4. Run `computePeerChanges` against that user's peer set, with `{ connectPx: EARSHOT_PX, disconnectPx: DISCONNECT_PX }`.
5. Update **both** users' peer sets. Peers are always symmetric: if Sam is in Riya's set, Riya is in Sam's.
6. Emit `EVENTS.PEERS_UPDATE` to each affected browser.
7. Clear the "moved" flags.

Positions live in the server's memory. MongoDB is only touched inside this tick, never once per `MOVE` message.

---

## 7. Client module interfaces

```js
// client/src/net/index.js (Person 1) — exports `net`
net.connect({ name })          // → Promise<{ selfId, roomId, spawn, players }>
net.sendMove({ x, y, dir })
net.onPlayersState(cb) / onPlayerJoined(cb) / onPlayerLeft(cb) / onPeersUpdate(cb) / onSignal(cb)
                               // each returns an unsubscribe function
net.onRejoin(cb)               // cb({ selfId, roomId, spawn, players }) after an automatic re-join;
                               // returns an unsubscribe function
net.sendSignal({ to, data })

// client/src/rtc/index.js (Person 1)
getMicStream()                 // → Promise<MediaStream>
createRtcManager({ net, selfId, micStream, onRemoteStream(id, stream), onPeerClosed(id), onPeerMode(id, mode) })
                               // → { setMuted(bool), closeAll() }
RtcLab                         // React component

// v5 additions to `net` (Person 1)
net.connect({ token, avatarColor })   // a signed-in join (instead of { name }); re-joins send the token,
                                      // the current floor and status again
net.sendStatus(status) / net.onPlayerStatus(cb)    // EVENTS.PLAYER_STATUS
net.onOfficeUpdate(cb)                             // EVENTS.OFFICE_UPDATE
net.changeFloor(floorId) / net.onFloorChanged(cb)  // EVENTS.FLOOR_CHANGE / FLOOR_CHANGED
net.leave()                                        // hang up on purpose (no automatic re-join)
SERVER_URL                                         // named export, for REST calls

// client/src/world/index.js (Person 3)
WorldCanvas                    // props: { net, selfId, spawn, initialPlayers, onFrame, debug }
                               // v5, all optional: fill, zoomable, controllerRef (gets { zoomIn, zoomOut,
                               // setZoom, getZoom, locate, jumpTo(x, y, dir), pulseAt(x, y), getPosition }),
                               // avatarColor, selfName, selfDotColorRef, peopleRef (id → { name, color, dotColor }),
                               // overlayData ({ layout, office }), onZoomChange(zoom), onNearElevator(bool), background
                               // onFrame(frame) every animation frame:
                               // frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }
                               // blocked is false until Week 3
createFakeNet({ bots })        // same functions as `net`, with wandering bots
WorldLab                       // React component

// client/src/audio/index.js (Person 4)
distanceToGain(distancePx)     // → 0..1, 0 at or beyond EARSHOT_PX
dxToPan(dxPx)                  // → -1..1, negative = speaker is to the left
createMixer()                  // → { resume(), addPeer(id, mediaStream), removePeer(id), setMode(id, mode), update(frame) }
createMicMeter(stream)         // → { getLevel(), stop() }
AudioControls                  // props: { micStream, muted, onToggleMute }
AudioLab                       // React component
```

Notes:

- An **unsubscribe function** stops a callback from being called. Example: `const stop = net.onPlayerLeft(cb);` … later `stop();`.
- `onSignal(cb)` receives the delivered shape `{ from, data }`.
- `onRejoin(cb)`: if the connection drops after joining (server restart, network blip), Socket.io reconnects by itself and `net` sends `JOIN` again with the same name. `cb` then gets the fresh `WORLD_INIT` data. The `selfId` is **new** (every old id is dead), so rebuild whatever used the old one: a new rtc manager, and a remounted `WorldCanvas` (`key={selfId}`). It is not called for the first join (that answer comes from `connect()`). Listeners added with the other `on…` functions keep working after a reconnect. `WorldCanvas` never calls `onRejoin`, so `createFakeNet` does not have to add it.
- `net.sendMove` is called at most `MOVE_SEND_HZ` times a second, and only when the player actually moved.
- `createFakeNet` returns an object with exactly the same functions as `net`, so `WorldCanvas` can't tell the difference.
- `dxToPan(dx)`: `dx` = speaker's x minus my x. Example: speaker 30 px to my right → `dx = 30` → a positive pan.
- `createMicMeter(stream).getLevel()` returns `0..1`.
- `mode` is `'falloff'` (default) or `'full'` (`AUDIO_MODES`).

---

## 8. How App.jsx connects them

In Weeks 1–2, `App.jsx` only shows the labs (`?lab=world`, `?lab=audio`, `?lab=rtc`). The full wiring happens in Week 3:

1. `net.connect({ name })` → the `world:init` data (`selfId`, `spawn`, `players`).
2. `getMicStream()` → `createRtcManager({ net, selfId, micStream, onRemoteStream: mixer.addPeer, onPeerClosed: mixer.removePeer, onPeerMode: mixer.setMode })`.
3. `<WorldCanvas net={net} selfId={selfId} spawn={spawn} initialPlayers={players} onFrame={mixer.update} />`.
4. `<AudioControls micStream={micStream} muted={muted} onToggleMute={rtc.setMuted} />`.

```
            ┌──────────── server (Socket.io) ────────────┐
            │  signaling (Person 1) ── geo (Person 2)     │
            └───────────────▲─────────────────────────────┘
                            │ events
                         ┌──┴──┐
                         │ net │  (Person 1)
                         └──┬──┘
             ┌──────────────┴──────────────┐
             ▼                             ▼
   ┌───────────────────┐         ┌───────────────────┐
   │ rtc manager (P1)  │         │ WorldCanvas (P3)  │
   └─────────┬─────────┘         └─────────┬─────────┘
  onRemoteStream / onPeerClosed      onFrame(frame)
      / onPeerMode                         │
             ▼                             ▼
          ┌───────────────── mixer (P4) ─────────────────┐
          │ addPeer · removePeer · setMode · update       │──► speakers
          └───────────────────────────────────────────────┘
   AudioControls (P4) ── onToggleMute ──► rtc.setMuted (P1)
```

---

## 9. Database (MongoDB, via Mongoose)

**`positions`** (Week 1):

```js
{
  _id: String,          // user id
  roomId: String,       // e.g. 'office-1'
  loc: [Number, Number],// [x, y] in px, x first
  updatedAt: Date,
}
// Index: { loc: '2d', roomId: 1 } with options { min: 0, max: 4096 }
```

The 2d index accepts only -180 to 180 by default (it's built for longitude and latitude). Our pixels go up to 4096, so the bounds **must** be set to `min: 0, max: 4096` (`WORLD_MAX_PX`), or saving fails.

Example document: `{ _id: 'a1', roomId: 'office-1', loc: [340, 210], updatedAt: 2026-10-18T10:00:00Z }`

**v5 — the Infotact directory** (`server/office/models.js`; ids are readable text, so the seed can run twice without duplicates):

```js
departments { _id: 'dept-engineering', name, color: '#2f80ed', floorId: 'floor-1', wingId: 'A',
              size: 8 /* desks the admin wants */, deskIds: ['A-01', …] /* the reserved block */ }
employees   { _id: 'emp-riya', email /* unique, lowercase */, name, role /* ROLES */, departmentId,
              floorId, deskId /* 'A-07', a hot desk 'H-02', or null */, hotDesk: Boolean, createdAt: Date }
floors      { _id: 'floor-1' /* also the room id */, name: 'Floor 1', tier: 1 /* only grows */ }
alerts      { _id: 'alert-…', type /* ALERT_TYPES */, message, floorId, createdAt: Date, resolved: Boolean }
```

The server keeps these in memory and writes changed documents after each admin action (never per move). Without `MONGODB_URI` it uses the demo directory in memory. Seed: `node server/office/seed.js` (idempotent); reset: `node server/office/reset-demo.js --yes`.

## 9b. REST routes (v5)

Token: `Authorization: Bearer <token>`. A token is `base64url(JSON { sub: employeeId, role, admin, exp }) + '.' + base64url(HMAC-SHA256(AUTH_SECRET, payload))`. Errors are `{ error: 'message' }`.

| Route | Who | Body → answer |
|---|---|---|
| `POST /api/auth/employee` | anyone | `{ email }` → `{ token, profile, admin: false }`, or 404 `"Not in the Infotact directory"` |
| `POST /api/auth/admin` | anyone | `{ email, password }` → `{ token, profile, admin: true }` when the role is `admin` and `password === ADMIN_PASSWORD`; else 401 |
| `GET /api/auth/demo` | anyone | → `{ employees: [{ email, name, department }], admin }` (the sign-in chips) |
| `GET /api/me` | token | → `{ profile, admin }`; `profile` = `{ employeeId, name, email, role, department: { id, name, color }, floorId, floorName, deskId, hotDesk, desk: { x, y } \| null }` |
| `GET /api/office/layout` | anyone | → the floor plan (`server/office/layout.json`) |
| `GET /api/office/floors/:floorId` | token | → the floor snapshot (shape of `OFFICE_UPDATE`) |
| `GET /api/admin/overview` | admin | → `{ headcount, desksUsed, capacity, hotDesksUsed, openAlerts, online, floors: [...], snapshots: [...] }` |
| `GET` / `POST /api/admin/departments` | admin | list (with `people`, `floorName`) / `{ name, color, size, floorId }` → new department with a reserved block |
| `PATCH /api/admin/departments/:id` | admin | `{ name?, color?, size? }` → department (resize re-runs the desk rule for it only) |
| `GET` / `POST /api/admin/employees` | admin | list of profiles + `online` / `{ name, email, role, departmentId }` → `{ employee, profile }` (seated by the desk rule) |
| `POST /api/admin/employees/sample` | admin | `{ departmentId, count }` → `{ added: [profile] }` |
| `GET` / `POST /api/admin/floors` | admin | floor snapshots / → the new floor (`floor-2`, …) |
| `POST /api/admin/floors/apply` | admin | `{ moves: [{ departmentId, floorId }] }` → `{ moved, reseated }` (rebalance; online members are moved) |
| `GET /api/admin/alerts`, `POST /api/admin/alerts/:id/resolve` | admin | alerts / → the resolved alert |

Every `/api/admin/*` route checks on the server that the token has `admin: true` and the employee's role is `admin` (else 401 / 403). An employee token never has `admin: true`, even for the admin person.

**PLANNED Week 3 — `zones`:** `{ roomId, name, type, box: [[x1, y1], [x2, y2]] }`. `type` is one of `ZONE_TYPES`; `box` is the top-left and bottom-right corners.

**PLANNED Week 4 — `rooms`:** `{ _id: roomId, name, map /* Tiled JSON */, updatedAt }`.

---

## 10. Map format

File: `client/public/maps/office.json`, made with Tiled (a free map editor).

- Orientation: orthogonal (a plain square grid).
- Tiles: 32 × 32 px (`TILE_SIZE`).
- Tilesets: **embedded** in the map file, so one file has everything.

Layers, in this order and with exactly these names:

| Layer | Kind | Meaning |
|---|---|---|
| `floor` | tiles | The floor |
| `furniture` | tiles | Desks, chairs, plants |
| `collision` | tiles | Any non-zero tile blocks walking |
| `zones` | objects | Rectangles with custom properties `zoneType` (one of `ZONE_TYPES`) and `name` (e.g. `'Meeting room A'`) |
| `spawn` | objects | One point named `spawn`, where new people appear |

**v5 — the HQ floor.** `office.json` is now made by `server/scripts/build-office-map.js` from `office-base.json` (the original 35 × 25 office, exported from Tiled). The script keeps the original in the top-left corner (every old position is unchanged), adds an east corridor, an elevator and four 25-desk wings in the same tileset (85 × 53 tiles), an invisible `collision` layer (`visible: false`) that blocks the outside area, and writes `server/office/layout.json`:

```js
{ tileSize: 32, widthPx, heightPx, spawn: { x, y }, elevator: { rect, x, y },
  wings: [{ id: 'A', tier: 1, rect /* inside the walls */, outer }],
  desks: [{ id: 'A-01', wingId, index, row, col, tileX, tileY, x, y /* avatar spot */, area /* 4 × 4-tile square */ }],
  hotDesks: [{ id: 'H-01', tileX, tileY, x, y }], rooms: [{ id, name, type /* ZONE_TYPES */, rect }] }
```

To change the original office: edit `office.tmx` in Tiled, export to `office-base.json` (not `office.json`), then run the script.

---

## 11. Zone rules (PLANNED, Weeks 3–4)

| Zone | A hears B when | Mode |
|---|---|---|
| open | B within `EARSHOT_PX` and no wall between | `falloff` |
| lobby | same as open | `falloff` |
| private | A and B in the same private zone | `full` |
| silent | never | — |
| stage | B is on the stage and A is in the stage hall (receive-only) | `full` |

**Which map areas use which zone type:**

| Map area | Zone type |
|---|---|
| Entrance | `lobby` |
| Desks and lounge | `open` (no zone object needed) |
| Meeting room, phone booth | `private` |
| Focus room | `silent` |
| Stage hall | `stage` |

---

## 12. Change log

| Version | Date | Change |
|---|---|---|
| v1 | 18 Oct 2026 | First version: constants, events, signaling rules, module interfaces, database, map format, planned zone rules |
| v1 | 19 Oct 2026 | Zone rules: which map areas use which zone type. Server interfaces: `connectDb(uri)` doesn't read `.env`; the caller passes `process.env.MONGODB_URI` |
| v2 | 21 Oct 2026 | Added ERROR_CODES (BAD_NAME, ALREADY_JOINED, NOT_JOINED, BAD_MOVE) to shared/constants.js; SERVER_ERROR `code` uses them |
| v3 | 27 Oct 2026 | Added `BAD_SIGNAL` to ERROR_CODES. Signaling rule 5: the server relays a `SIGNAL` only between peers within earshot, otherwise it replies `SERVER_ERROR` `BAD_SIGNAL` |
| v4 | 29 Oct 2026 | Added `net.onRejoin(cb)` (section 7): after a reconnect, `net` joins again by itself and calls `cb({ selfId, roomId, spawn, players })` with the new id |
| v5 | 12 Nov 2026 | Constants: `STATUSES`, `ROLES`, `WING_IDS`, `DESKS_PER_WING`, `FLOOR_CAPACITY`, `DEFAULT_FLOOR_ID`, `TOKEN_TTL_MS`, `AVATAR_COLORS`, `ALERT_TYPES`; error codes `BAD_TOKEN`, `BAD_STATUS`, `BAD_FLOOR`, `WING_CLOSED` |
| v5 | 12 Nov 2026 | Events: `PLAYER_STATUS` (`player:status`), `OFFICE_UPDATE` (`office:update`), `FLOOR_CHANGE` (`floor:change`), `FLOOR_CHANGED` (`floor:changed`) — section 4b |
| v5 | 12 Nov 2026 | Payload fields: `JOIN { token, avatarColor?, floorId?, status? }`; `WORLD_INIT.profile`, `WORLD_INIT.office`; players in `WORLD_INIT` / `PLAYER_JOINED` gain `status`, `employeeId`, `role`, `avatarColor`, `department` |
| v5 | 12 Nov 2026 | Rooms: one room per floor (room id = floor id); `PLAYERS_STATE`, `PLAYER_LEFT`, the tick and the geo engine are per room. Signaling rule 6 (same room, not DND) |
| v5 | 12 Nov 2026 | REST routes: `/api/auth/employee`, `/api/auth/admin`, `/api/auth/demo`, `/api/me`, `/api/office/layout`, `/api/office/floors/:floorId`, `/api/admin/*` — section 9b. Env: `AUTH_SECRET`, `ADMIN_PASSWORD` |
| v5 | 12 Nov 2026 | Collections: `departments`, `employees`, `floors`, `alerts` (section 9) |
| v5 | 12 Nov 2026 | Interfaces: `attachSignaling(io, { geo, createGeoEngine })` returns `{ getOnlineEmployeeIds }`; `net.sendStatus`, `onPlayerStatus`, `onOfficeUpdate`, `changeFloor`, `onFloorChanged`, `leave`, `SERVER_URL`; optional `WorldCanvas` props for the office; pure `chooseDesk`, `reserveBlock`, `resizeBlock`, `planRebalance`, tier functions |
| v5 | 12 Nov 2026 | Map: `office.json` generated from `office-base.json` by `server/scripts/build-office-map.js` (85 × 53 tiles, 4 wings × 25 desks, 14 hot desks, elevator, invisible `collision` layer); `server/office/layout.json` |

## 13. The Infotact office in one paragraph (v5)

Landing (`#/`) → sign-in (`#/signin`: Employee by email, or Admin by email + password) → lobby (`#/lobby`: colour, mic test) → office (`#/office`) or admin (`#/admin`). The office is one floor plan used by every floor; a floor opens wing by wing as it grows (tiers); each department sits in its own block of neighbouring desks; overflow hires get hot desks and the admin is alerted; the admin adds a floor and moves departments to it. `?lab=world|audio|rtc|office` pages are unchanged.
