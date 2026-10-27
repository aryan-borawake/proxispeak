# ProxiSpeak Contracts

**v3 — 27 Oct 2026**

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
- **Room.** There is one room, `DEFAULT_ROOM` = `'office-1'`.
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
attachSignaling(io, { geo })
```

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
net.sendSignal({ to, data })

// client/src/rtc/index.js (Person 1)
getMicStream()                 // → Promise<MediaStream>
createRtcManager({ net, selfId, micStream, onRemoteStream(id, stream), onPeerClosed(id), onPeerMode(id, mode) })
                               // → { setMuted(bool), closeAll() }
RtcLab                         // React component

// client/src/world/index.js (Person 3)
WorldCanvas                    // props: { net, selfId, spawn, initialPlayers, onFrame, debug }
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
