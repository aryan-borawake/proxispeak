# 02 — Signaling, the broadcast and the proximity tick

*Code: `server/signaling/index.js` (join, move, status, floor change, signal relay, broadcast, disconnect), `players.js` (the in-memory store), `tick.js` (the 250 ms tick), `officeRooms.js` (token joins, floors), `moveCheck.js` (speed check), `areaChat.js`, `roomAreas.js`, `fakeNearby.js`; browser side `client/src/net/index.js`.*

**Signaling** means passing small setup messages between browsers through our server, so they can start a direct voice connection. In ProxiSpeak the signaling server does more than that: it also owns positions and decides who may connect.

---

## 1. The messages

An **event** is a named Socket.io message; the data inside it is the **payload**. Names live in `shared/events.js`; code always writes `EVENTS.MOVE`, never the text `'player:move'`.

| Event | Direction | Payload | When |
|---|---|---|---|
| `player:join` | browser → server | `{ name }` (labs, tests) or `{ token, avatarColor?, floorId?, status? }` | once |
| `world:init` | server → that browser | `{ selfId, roomId, spawn, players, profile?, office? }` | reply to join |
| `player:joined` | server → the rest of the room | `{ id, name, x, y, dir, status, … }` | someone joined |
| `player:move` | browser → server | `{ x, y, dir }` | at most 10/s, only if I moved |
| `players:state` | server → everyone in a room | `{ t, players: [{ id, x, y, dir }] }` | every 100 ms |
| `player:left` | server → the room | `{ id }` | disconnect or floor change |
| `peers:update` | server → one browser | `{ entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }` | when it changes (checked every 250 ms) |
| `rtc:signal` | browser → server → browser | sent `{ to, data }`, delivered `{ from, data }` | WebRTC handshakes |
| `player:status` | both ways | `{ status }` / `{ id, status }` | status change |
| `floor:change` / `floor:changed` | browser → server / server → browser | `{ floorId }` / like `world:init` | elevator |
| `office:update`, `layout:update`, `chat:send`, `chat:message` | see `07` and `08` | | |
| `server:error` | server → one browser | `{ code, message }` | bad input |

---

## 2. Where the data lives

```js
// server/signaling/players.js
const players = new Map();
// 'kX9a2bQ' → { id: 'kX9a2bQ', name: 'Riya', x: 1632, y: 2104, dir: 'down', roomId: 'floor-1',
//               status: 'available', moved: true, employeeId: 'emp-riya', … }
```

A **Map** is a JavaScript key → value table. The key is the **socket id** (a random 20-character id Socket.io gives every connection). Positions are here, in memory, not in MongoDB, because moves arrive up to 10 times a second per person. MongoDB is only touched in the tick.

`moved` is a server-only flag ("new or moved since the last tick"). It never leaves the server: every outgoing message copies only the fields the contract lists.

---

## 3. Join

Example: Riya's browser sends `player:join { token: 'eyJ…', avatarColor: '#2f80ed' }`.

1. **Same tab twice?** If her socket already joined → `ALREADY_JOINED`.
2. **Validate.** A token join runs `readTokenJoin`: the token must verify and its employee must exist (else `BAD_TOKEN`). A name join needs a non-empty text name (else `BAD_NAME`).
3. **Add the player** at the spawn point with `moved = true`, and give one free move (`allowFreeMove`).
4. **Join the room**: `socket.join('floor-1')`.
5. **Reply** `world:init` to her only: her id, room, spawn, everyone else on the floor, her `profile` and the floor's `office` snapshot.
6. **Tell the others**: `socket.to('floor-1').emit('player:joined', …)` ("the room, except me").

Why `moved = true` at join? The tick only looks at players who moved. Two people who join at the same spawn point and stand still would otherwise never connect, although they are 0 px apart.

A **room** in Socket.io is a named group of sockets: `io.to('floor-1').emit(...)` reaches everyone in it. Every socket is also alone in a room named after its own id, which is how the server sends to exactly one browser (`io.to(socketId)`).

---

## 4. Move

Example: `player:move { x: 1676, y: 2104, dir: 'right' }`.

1. **Joined?** If not → `NOT_JOINED`.
2. **Shape.** `x` and `y` must be numbers (the text `'10'` is refused), finite (NaN refused), from 0 to 4096; `dir` one of up/down/left/right. Else → `BAD_MOVE`, and the old position stays.
3. **Closed wing.** For employees, a move whose avatar middle is inside a wing that is not open on this floor → `WING_CLOSED`, ignored.
4. **Speed check** (`moveCheck.js`, below). A too-long move is shortened.
5. **Store** only `x`, `y`, `dir` and set `moved = true`.

The server does not reply and does not forward the move. The 100 ms broadcast does that.

### The speed check (movement budget)

Why: a modified browser could send "I'm across the office" ten times a second and fly through walls into any room.

How: each player has a **budget** in pixels.

- It fills with time at `RUN_SPEED_PX_PER_SEC` = 440 px/s.
- It holds at most `MOVE_BUDGET_MS` = 250 ms of running: `440 × 0.25 = 110 px`.
- Every move spends its length. A move longer than the budget is cut to the budget, in the same direction.

Example: Riya runs, sending a move every 100 ms. Each message adds 44 px of budget and spends 44 px: never shortened. A cheat jumps 600 px: the budget is at most 110 px, so the server moves her 110 px that way and logs a warning.

Free jumps (no budget needed): the first move after joining or changing floor, her own desk (Ctrl+D), the lobby spawn, the elevator. `{ name }` joins (labs, robot tests) are not checked.

Why shorten instead of refuse? A slow network can bunch several moves together. Refusing them would freeze the person; shortening lets the position catch up as soon as the budget fills again.

Known gap: the free first move after a join means someone could reconnect to jump once.

---

## 5. The 100 ms broadcast

```js
// server/signaling/index.js, startStateBroadcast (every STATE_BROADCAST_MS = 100 ms)
for (const player of players) {
  const list = positionsByRoom.get(player.roomId) || [];
  list.push({ id: player.id, x: player.x, y: player.y, dir: player.dir });
  positionsByRoom.set(player.roomId, list);
}
for (const [roomId, positions] of positionsByRoom) {
  io.to(roomId).emit(EVENTS.PLAYERS_STATE, { t, players: positions });
}
```

1. Group all players by room.
2. Send each room one message with only its own players (four fields each).
3. Nobody online → send nothing.

One timer for the whole server, not one per player. `t` is the server clock (`Date.now()`); the world currently slides avatars by a fixed glide and does not use `t` (see `06-world-canvas.md`).

---

## 6. The proximity tick, step by step

Why a timer and not on every move? "Who can hear whom" changes slowly and each check costs database queries. Every 250 ms (`PROXIMITY_TICK_MS`) is 4 checks a second: fast enough to feel instant, cheap enough for the database.

Example to follow: on floor 1, Riya at (1632, 2104) and Sam at (1672, 2104), both in the lobby, 40 px apart, not connected yet. Riya just moved.

1. **Who moved?** `movedPlayers = [Riya]`. Nobody → the tick ends at once.
2. **Clear the flags now**, before any waiting, so a move that arrives during the tick sets the flag again for the next tick.
3. **Save positions**: one `upsertPositions` (`bulkWrite`) per floor that had movers. If it fails, the flags are put back and the tick is skipped, because answers from stale positions can't be trusted.
4. **Which area is everyone in?** One `locateUsers` per floor: a single MongoDB aggregate with one `$geoWithin` per area. It writes `player.area` and `player.onPlatform` on **every** player of that floor (not only movers). Riya and Sam: both in the area `lobby` (type `lobby`). Without MongoDB, or if it fails: `areaAt` in memory. See `04-mongodb-geo.md`.
5. **Who is near?** `findNearby(Riya, 140)` for every mover, in parallel (`Promise.all`): MongoDB `$near` within `DISCONNECT_PX` = 140 px, same room. Answer: `[{ id: Sam, distance: 40 }]`. One failed query only skips that mover.
6. **Decide, one mover at a time** (`updatePeersOf`), with no more waiting, so each step sees the previous step's changes:
   1. Candidates = people near her ∪ her current peers (to drop those she can't hear any more) ∪ everyone in the same private area or stage hall (any distance).
   2. For each candidate, `describeLink`: `canHear(Riya, Sam)` and `canHear(Sam, Riya)` (the room rules, `server/geo/canHear.js`). Lobby, 40 px ≤ 100 → audible, `falloff`, both ways.
   3. Not wanted any more and connected → disconnect.
   4. Wanted: sort by relevance, then connect, keeping within 8 peers for both people (section 8).
7. **Tell the browsers.** One `peers:update` per affected browser. Riya gets `{ entered: [{ id: Sam, mode: 'falloff' }], left: [], changed: [] }`; Sam gets the same with Riya's id.
8. **Statistics.** The tick's duration is recorded; every 5 s the server logs `[tick] stats 5s: … avg … p95 … max … peers/user …` and `/api/health` shows the last window.

In code:

```js
// server/signaling/tick.js, runProximityTick (shortened)
const movedPlayers = listPlayers().filter((player) => player.moved === true);
for (const player of movedPlayers) player.moved = false;
await Promise.all([...moversByRoom].map(([roomId, movers]) => geoFor(roomId)?.upsertPositions(...)));
await Promise.all([...moversByRoom.keys()].map((roomId) => locateRoom(roomId, geoFor(roomId))));
const nearbyLists = await Promise.all(movedPlayers.map((player) => askWhoIsNear(geoFor(player.roomId), player)));
for (let i = 0; i < movedPlayers.length; i += 1) updatePeersOf(movedPlayers[i], nearbyLists[i], changes);
sendPeerUpdates(io, changes);
```

**No overlapping ticks.** A flag `tickIsRunning` skips a tick if the previous one is still waiting for MongoDB. A slow tick delays the next one; two ticks never change the peer sets at the same time.

**`Promise.all`** starts several async jobs at once and waits until all are done, so 50 nearby queries take about as long as the slowest one, not the sum.

---

## 7. Peer sets, modes and the 100/140 px rule

```js
// server/signaling/tick.js
const peerSets = new Map();   // 'riya' → Set { 'sam', 'lee' }
const peerModes = new Map();  // 'riya' → Map { 'sam' → 'falloff' }
```

A **Set** is a list that can't hold the same value twice.

- **Symmetric:** `connectPair` adds Sam to Riya's set and Riya to Sam's; `disconnectPair` removes both.
- **Modes are per direction:** on a stage the audience hears the speaker `full`, the speaker hears that audience member `falloff`. So `peerModes` stores "how Riya hears Sam" and "how Sam hears Riya" separately.
- **Net result per tick:** `remember()` notes how each pair looked before the tick touched it; `sendPeerUpdates` compares before and after. A pair dropped and re-added in the same tick produces no message, and a browser never gets `left` and `entered` for the same person at once.

### The 100 / 140 px rule (hysteresis)

**Hysteresis** means using a different threshold to switch on than to switch off.

| Situation | Distance | Result |
|---|---|---|
| Not connected | 90 px | 90 ≤ 100 → connect |
| Not connected | 130 px | > 100 → stay apart |
| Connected | 130 px | ≤ 140 → stay connected |
| Connected | 150 px | > 140 → disconnect |

Why: with one line at 100 px, someone standing at 99–101 px would connect and disconnect every tick (flicker). The 40 px gap absorbs small wobbles. In code it is the `connected` option of `canHear`:

```js
// server/geo/canHear.js
function byDistance(listener, speaker, connected) {
  const limit = connected ? DISCONNECT_PX : EARSHOT_PX;
  const distance = Math.hypot(speaker.x - listener.x, speaker.y - listener.y);
  return distance <= limit ? { audible: true, mode: AUDIO_MODES.FALLOFF } : SILENCE;
}
```

Note: between 100 and 140 px the connection stays open but the volume formula already gives 0 (see `05-audio.md`), so you hear nothing; the connection is just kept ready.

`tick-test.js` checks every row of that table with robots (90 px → entered, 130 px not connected → nothing, 130 px connected → no left, 200 px → left).

(History: before v6 the tick used the pure function `computePeerChanges`, which is still in `server/geo/peerChanges.js` and `fakeNearby.js` and in CONTRACTS section 6. The v6 tick replaced it with `canHear`, which contains the same 100/140 rule plus the room rules.)

---

## 8. The 8-peer cap (`MAX_PEERS`)

Why a cap? In a **mesh** (every pair has its own connection), each connection carries its own copy of my voice. Uploading 30 copies would choke a home connection. At most 8 × 32 kbps = 256 kbps.

How a link is ranked for one person (smaller = more relevant):

```js
// server/signaling/tick.js
function rankOf(hearing, distance) {
  if (!hearing.audible) return RANK_ONLY_FOR_THE_OTHER + distance; // 2 000 000 + d
  return (hearing.mode === AUDIO_MODES.FULL ? RANK_FULL : RANK_FALLOFF) + distance; // 0 + d, or 1 000 000 + d
}
```

1. `full` links (same room, stage speaker), nearest first.
2. `falloff` links (open floor), nearest first.
3. Links only the *other* person needs (e.g. a far audience member, for the speaker), nearest first.

`makeRoomFor(player, newRank)`: fewer than 8 → yes. Full → find their worst link; if it ranks worse than the new one, drop it and say yes; otherwise no. This runs for **both** people of the new link.

Example: Riya has 8 open-floor peers at 20, 30, … 95 px (ranks 1 000 020 … 1 000 095).
- A new person at 30 px (rank 1 000 030): her worst is 95 px → dropped, the new one connects.
- A new person at 98 px (rank 1 000 098): worse than all 8 → not connected.
- Someone in the same meeting room (rank 0 + d): always beats any open-floor link.

The test `peer-cap-test.js`: 12 robots on one spot → counts 8 8 8 8 8 8 8 8 8 8 8 6, every link listed on both sides; a 13th robot 95 px away only takes free slots and never pushes out nearer links.

---

## 9. Signal relay (WebRTC notes)

`rtc:signal { to, data }`, where `data` is `{ type: 'offer' | 'answer', sdp }` or `{ type: 'candidate', candidate }`.

1. Sender joined? Else `NOT_JOINED`.
2. Shape correct? Else `BAD_SIGNAL` with the reason.
3. `to` online? Else `BAD_SIGNAL`.
4. `to` in the sender's peer set (`arePeers`)? Else `BAD_SIGNAL` ("not within earshot"). This also refuses sending to yourself.
5. Deliver to that one socket as `{ from: socket.id, data }`. The server writes `from` itself and copies only the allowed fields, so a browser can't pretend to be someone else or smuggle extra data.

Example: Riya (`a1`) sends `{ to: 'b7', data: { type: 'offer', sdp: 'v=0…' } }` → Sam (`b7`) gets `{ from: 'a1', data: { type: 'offer', sdp: 'v=0…' } }`. The server never reads the SDP text.

---

## 10. Leaving, Do Not Disturb, floors

**Disconnect** (tab closed, Wi-Fi lost, refresh):
1. Remove from the players Map.
2. `removeFromPeers`: take them out of every peer set and send each former peer `peers:update { left: [id] }` at once (the tick only checks movers, so a peer standing still would otherwise stay connected to a ghost).
3. Delete their MongoDB position (not awaited; errors only logged).
4. `player:left` to the room.

**Do Not Disturb** (`player:status { status: 'dnd' }`): `disconnectAllPeers` hangs up everything now (both sides get `left`), and `canHear` returns "not audible" whenever either person is DND, so the tick never reconnects them. Back to available/busy → `moved = true`, the next tick reconnects whoever is near. `busy` is only a label; it does not change hearing.

**Rooms per floor.** Every floor is a Socket.io room named by its id. `DEFAULT_ROOM = 'office-1'` is for `{ name }` joins (labs, robot tests), which have no areas: plain proximity.

```
 floor-1 room: Riya, Sam   ── players:state, peers:update, geo engine (roomId 'floor-1')
 floor-2 room: Arjun       ── players:state, peers:update, geo engine (roomId 'floor-2')
 office-1 room: robot tests, labs (no areas)
```

In words: each floor has its own broadcast, its own tick decisions and its own geo engine, so people on different floors never see or hear each other even at the same x, y.

**Changing floor** (elevator + E, or the Floors button), `movePlayerToFloor`:
1. Hang up all their peers (both sides get `left`).
2. Delete their position in the old floor's geo engine.
3. Leave the old room; `player:left` there.
4. Join the new room at the elevator spot, fresh movement budget, `moved = true`.
5. `floor:changed` to them (same shape as `world:init`, same socket id); `player:joined` to the new room.

The browser rebuilds its WebRTC manager and remounts the world. The admin moving a department to another floor triggers the same function for its online members (`watchOfficeChanges`).

---

## 11. Re-join after a reconnect

1. The connection drops (server restart, network blip). The browser's `net` clears its `selfId`, so no stale moves or signals are sent.
2. Socket.io reconnects by itself, on the same socket object, with a **new** socket id.
3. On `connect`, `net` sees it had joined before and sends `player:join` again: the same token and colour, plus the floor it was on and its status (`rejoinPayload`).
4. The fresh `world:init` goes to every `onRejoin` callback. The page rebuilds the WebRTC manager for the new id and remounts `WorldCanvas` (`key={selfId}`).
5. The others see `player:left` (old id) and `player:joined` (new id), and their peer sets change accordingly.

The first move after this join is free (the reconnect puts you back where you were). Test: `server/scripts/reconnect-test.js` (7 checks).

---

## 12. Redis (multi-server) — TO BE ADDED

**Not on this branch.** Another session is adding Redis in a separate folder. When it is merged, this section will explain: how two server copies share Socket.io messages (the Redis adapter), where the players Map and peer sets live, and which copy runs the tick for each floor. The planned design is in `12-redis.md`.
