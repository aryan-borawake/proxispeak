# How the signaling server works (v1)

Module 1 · Person 1 (Aryan) · Covers the code on branch `aryan` up to Task 6.

Files described here: `server/signaling/index.js`, `server/signaling/players.js`, `server/signaling/tick.js`, `server/signaling/fakeNearby.js`, `client/src/net/index.js`.
Event names and payloads come from `CONTRACTS.md` (v2), sections 4–6.

---

## A small example first: Riya and Sam

1. Riya opens the app and joins with her name. The server puts her at the spawn point (200, 200), facing down. She is alone, so her list of other people is empty.
2. Sam joins. The server tells Sam "you are at (200, 200), and Riya is already here at (200, 200)". It tells Riya "Sam just joined".
3. Within a quarter of a second, the server notices that Riya and Sam are 0 px apart. It tells both browsers "this person came close to you".
4. Sam walks right. His browser sends his new position up to 10 times a second. Every 100 ms the server sends everyone's positions to everyone, so Riya sees Sam move.
5. Sam reaches (320, 200), 120 px from Riya. Nothing changes: they stay connected until they are more than 140 px apart.
6. Sam reaches (350, 200), 150 px from Riya. Within 250 ms the server tells both browsers "this person walked away".
7. Sam closes his tab. The server forgets him and tells Riya "Sam left".

The rest of this document explains each step.

---

## 1. What the signaling server does

The **signaling server** is our Node.js program that every browser stays connected to; it works like a post office. It keeps a list of everyone in the office and their positions in memory, and handles people joining, moving and leaving. Ten times a second it sends everyone's positions to every browser, and four times a second it checks who is near whom and tells each browser who came close or walked away. It never carries anyone's voice; later (Task 8) it will only pass the short setup notes that let two browsers connect to each other directly.

---

## 2. Joining

Words first:

- A **socket** is one browser's live connection to the server (we use Socket.io). Every socket gets a random **socket id** such as `'kX9a2bQ'`, chosen by the server. We use it as the player's id.
- An **event** is a named message, like `player:join`. The **payload** is the data inside it, like `{ name: 'Riya' }`.
- A **room** is a named group of sockets. Sending to a room reaches every socket in it. We have one room, `office-1` (`DEFAULT_ROOM`).
- **In memory** means the data lives in a JavaScript variable inside the running server, not in a database. The player list is a **Map** (a lookup table from a key to a value): socket id → `{ id, name, x, y, dir }`. It lives in `players.js`.

Step by step, when a browser sends `player:join` with `{ name }` (`handleJoin` in `index.js`):

1. **Already joined?** If this socket is already in the player list, the server sends back `server:error` with code `ALREADY_JOINED` and stops.
2. **Check the name.** The name must be text. The server trims spaces from both ends. If nothing is left (missing, not text, empty, or only spaces), it sends `server:error` with code `BAD_NAME` and stops.
3. **List who is already here**, before adding the newcomer, so the newcomer is not in their own list.
4. **Add the player** to the Map at `DEFAULT_SPAWN` (200, 200), facing `'down'`.
5. **Put the socket in the room** `office-1`.
6. **Reply to the joiner only** with `world:init`: `{ selfId, roomId, spawn: { x, y }, players: [...] }`.
7. **Tell everyone else in the room** with `player:joined`: `{ id, name, x, y, dir }`.

Example `world:init` that Sam receives:

```
{ selfId: 'b7', roomId: 'office-1', spawn: { x: 200, y: 200 },
  players: [{ id: 'a1', name: 'Riya', x: 200, y: 200, dir: 'down' }] }
```

Every error goes out as `server:error` with `{ code, message }`. The code is one of `ERROR_CODES` from `shared/constants.js`. The message says what went wrong and what to do.

The server also stores a hidden flag, `moved`, on each player (explained in section 5). Messages copy only `{ id, name, x, y, dir }`, so this flag never reaches a browser.

---

## 3. Moving and the position broadcast

### Receiving a move

A browser sends `player:move` with `{ x, y, dir }` (`handleMove` in `index.js`).

**Validation** means checking data before using it. A browser can send anything, so the server never trusts it.

1. **Joined?** If this socket has not joined, the server sends `server:error` with `NOT_JOINED` and stops.
2. **Valid?** The move is refused with `server:error` code `BAD_MOVE` unless:
   - the payload is an object (not missing, not `null`);
   - `x` and `y` are each a real number type, finite, and from 0 to 4096 (`WORLD_MAX_PX`), both ends allowed;
   - `dir` is one of `'up'`, `'down'`, `'left'`, `'right'` (`DIRECTIONS`).

   On a bad move, the old position stays as it was.
3. **Store it.** The server copies only `x`, `y` and `dir` into the player's entry (extra fields are ignored) and sets `moved = true`.

Examples:

| Payload | Result |
|---|---|
| `{ x: 250, y: 300, dir: 'right' }` | stored |
| `{ x: '10', y: 300, dir: 'right' }` | `BAD_MOVE` (x is text, not a number) |
| `{ x: 250, y: 5000, dir: 'right' }` | `BAD_MOVE` (y is outside the map) |
| `{ x: 250, y: 300, dir: 'north' }` | `BAD_MOVE` (not one of the four directions) |

The server does not reply to a good move, and does not pass it on.

### The broadcast: one `players:state` every 100 ms

A **broadcast** is one message sent to everyone in a room.

Every 100 ms (`STATE_BROADCAST_MS`), one timer for the whole server sends `players:state` to the room:

```
{ t: 1760781234567, players: [{ id: 'a1', x: 200, y: 200, dir: 'down' },
                              { id: 'b7', x: 320, y: 200, dir: 'right' }] }
```

`t` is the server's clock in milliseconds (`Date.now()`). If nobody is in the office, nothing is sent.

**Why not forward each move straight away?** Because the number of messages would explode. With 10 people each moving 10 times a second, forwarding every move to the 9 others means 10 × 10 × 9 = 900 messages a second. With the broadcast, each browser gets exactly 10 messages a second, whatever the number of moves. A move just overwrites the old position, so if a browser sends moves faster than that, only the latest one is broadcast. The server does not limit how fast moves arrive; the browser (Person 3's world) promises to send at most 10 a second (`MOVE_SEND_HZ`).

### Leaving: `player:left`

When a tab closes or the connection drops, Socket.io fires a `disconnect` (`handleDisconnect` in `index.js`):

1. The server removes the player from the Map. If they never joined, there is nobody to tell, so it stops.
2. It removes them from every peer set and tells each former peer with `peers:update` (see section 5).
3. It sends `player:left` with `{ id }` to everyone still in the room, so they can delete that character.

---

## 4. The browser side: `client/src/net/index.js`

This file is the browser's one connection to the server. It exports one object, `net`, with exactly the functions in `CONTRACTS.md` section 7:

| Function | What it does |
|---|---|
| `net.connect({ name })` | Connects, sends `player:join`, and returns a **Promise** (a value that arrives later) that gives back the `world:init` payload |
| `net.sendMove({ x, y, dir })` | Sends `player:move`. Does nothing before joining |
| `net.onPlayersState(cb)` | Calls `cb` on every `players:state` |
| `net.onPlayerJoined(cb)` | Calls `cb` on every `player:joined` |
| `net.onPlayerLeft(cb)` | Calls `cb` on every `player:left` |
| `net.onPeersUpdate(cb)` | Calls `cb` on every `peers:update` |
| `net.onSignal(cb)` | Calls `cb` on every `rtc:signal` (nothing sends these yet) |
| `net.sendSignal({ to, data })` | Sends `rtc:signal`. Does nothing before joining |

Each `on…` function returns an **unsubscribe function**: call it to stop listening. Example: `const stop = net.onPlayerLeft(cb);` … later `stop();`.

Details of `connect()`:

- If already joined, it returns the same answer again. If a join is already on its way, it returns that same Promise, so two quick clicks join only once.
- It starts listening for `world:init`, `server:error` and `connect_error` *before* connecting, so a fast reply cannot be missed.
- It fails with a clear error if the server refuses the join (for example `BAD_NAME`), if the server can't be reached, or after 5 seconds with no answer.
- If the connection drops later, `net` forgets its id, because a new connection gets a new socket id. It does not rejoin by itself yet.

The server address is `VITE_SERVER_URL` from the environment, or `http://localhost:3001` if that is not set.

**Why `autoConnect: false`?** The socket is created once, when the file is first imported, but `autoConnect: false` means "create it, don't dial the server yet". The other modules (the world, WebRTC) can then register their listeners first, and nothing is missed. The browser only dials when someone calls `net.connect()`.

---

## 5. The proximity tick

Words first:

- The **proximity tick** is a timer that runs every 250 ms (`PROXIMITY_TICK_MS`) and asks "who is near whom?". It lives in `tick.js`.
- A **peer** is someone you are connected to (later, someone whose voice you hear).
- A **peer set** is the list of one player's peers. It is a **Set**: like an array that can't hold the same value twice. Example: Riya's set is `{ 'b7' }`.
- **Symmetric** means it always goes both ways: if Sam is in Riya's set, Riya is in Sam's set.

### Who gets checked

Only players whose `moved` flag is `true`. The flag is set when a player joins and on every valid move. If nobody moved, the tick does nothing.

New players start with `moved = true`. Without that, Riya and Sam could join at the same spawn point, stand still, and never be connected, even though they are 0 px apart.

### One tick, step by step

1. **Collect** the players who moved. Nobody moved → stop.
2. **Clear** their `moved` flags straight away. A move that arrives while the tick is still working sets the flag again, so the next tick picks it up instead of losing it. (`CONTRACTS.md` lists this as the last step; the code does it early on purpose.)
3. **Ask who is near**, for every moved player at once (`Promise.all`), with `findNearby(id, DISCONNECT_PX)`: everyone within 140 px, closest first, never the player themselves. If one question fails, it is logged and that player is skipped this time.
4. **Compare** each answer with that player's peer set using `computePeerChanges` (rules below). This is done one player at a time, and each pair is updated before the next player is checked.
5. **Update both peer sets.** For each "entered", add each player to the other's set. For each "left", remove each from the other's set. If the pair is already connected (or already apart), nothing is recorded, so nobody gets the same change twice.
6. **Send** each affected browser one `peers:update` with everything that changed for it.

Right now `findNearby` and `computePeerChanges` come from `fakeNearby.js`, a fake that measures straight-line distance (`Math.hypot`) from the in-memory Map. It answers in the same format as Person 2's engine, so Task 9 only changes which functions `tick.js` calls.

A flag stops a second tick starting while the first is still running, and an error in one tick is logged without crashing the server.

### Connect at 100 px, disconnect at 140 px

`computePeerChanges` follows these rules:

- **Not connected** and distance ≤ 100 px (`EARSHOT_PX`) → **entered**.
- **Connected** and distance > 140 px (`DISCONNECT_PX`), or not in the `findNearby` answer at all → **left**.
- Anything else → no change.

**Why two distances?** With one line at 100 px, someone standing at 99–101 px would connect, disconnect, connect… every tick. That is called **flicker**. The 40 px gap means small wobbles at the edge change nothing.

Example (Sam is the one who moved, Riya stands still):

| Sam's distance from Riya | Connected before? | Result |
|---|---|---|
| 90 px | no | entered (90 ≤ 100) |
| 120 px | no | nothing (too far to connect) |
| 120 px | yes | nothing (not far enough to disconnect) |
| 150 px | yes | left (150 > 140, so not even in the answer) |

### `peers:update`

Sent only to the browsers whose peers changed:

```
{ entered: [{ id: 'a1', mode: 'falloff' }], left: [], changed: [] }
```

In Weeks 1–2, `mode` is always `'falloff'` (`AUDIO_MODES.FALLOFF`) and `changed` is always empty.

Because peers are symmetric, both people get a message even if only one of them moved. If Sam walks up to Riya while she stands still, Riya still gets "Sam entered".

**On disconnect** the server does not wait for the next tick. It removes the leaver from every peer set right away and sends each former peer `{ entered: [], left: [leaverId], changed: [] }`. Why: the tick only checks people who moved, so a peer standing still would otherwise stay "connected" to someone who is gone.

---

## 6. Who talks to whom

```
  Riya's browser                     Server                        Sam's browser
  (client/src/net)            (server/signaling)                 (client/src/net)
        |                             |                                  |
        |-- player:join {name} ------>|                                  |
        |<-- world:init --------------|                                  |
        |                             |<--------- player:join {name} ----|
        |<-- player:joined -----------|---------- world:init ----------->|
        |                             |                                  |
        |-- player:move {x,y,dir} --->|<-------- player:move {x,y,dir} --|
        |   (up to 10/sec)            |  stores in memory (players.js)   |
        |                             |                                  |
        |<-- players:state -----------|---------- players:state -------->|
        |   (every 100 ms, to the     |                                  |
        |    whole room)              |                                  |
        |                             |  tick every 250 ms (tick.js):    |
        |                             |  who moved? findNearby (fake),   |
        |                             |  computePeerChanges              |
        |<-- peers:update ------------|---------- peers:update --------->|
        |   (only if something        |                                  |
        |    changed for you)         |                                  |
        |                             |<--------- (tab closed) ----------|
        |<-- player:left {id} --------|                                  |
        |<-- peers:update {left} -----|  (only if Sam was Riya's peer)   |
        |                             |                                  |
   any bad input  -->  server:error { code, message } back to that browser only
```

---

## 7. Not built yet

- **Passing WebRTC notes (`rtc:signal`), Task 8.** The browser side (`net.sendSignal`, `net.onSignal`) exists, but the server has no handler for `rtc:signal` yet, so these notes go nowhere.
- **Person 2's geo engine, Task 9.** `attachSignaling` receives `geo: null`. The tick does not save positions to MongoDB yet (`upsertPositions` is skipped) and uses the fake `findNearby` and `computePeerChanges` from `fakeNearby.js`.
- **The microphone and the voice connection itself** (Tasks 7–10).

---

## 8. Viva answers

Built from section 10 of `docs/briefs/module-1-signaling-webrtc.md`, limited to what the code does today.

**Why three speeds: 60, 10 and 4 times a second?**
Drawing needs 60 frames a second to look smooth (that is Person 3's world), but positions only need 10, so the server broadcasts every 100 ms. "Who is near" changes slowly, so the tick checks only 4 times a second (every 250 ms).

**Why does the server send one `players:state` every 100 ms instead of forwarding each move?**
Forwarding every move would grow fast: 10 people moving 10 times a second would cause 900 messages a second. With one broadcast every 100 ms, each browser gets exactly 10 messages a second, and each move just overwrites the last one.

**Why is "who is near" checked only every 250 ms, and only for players who moved?**
Nearness changes slowly, and later each check will cost a MongoDB query, so fewer checks means less load. Someone who did not move cannot have come closer by themselves; if someone else walked up to them, the walker's check updates both peer sets.

**How many connections does a group of 8 need?**
8 × 7 ÷ 2 = 28, because each pair is one connection and a pair is counted once. In our tick, if 8 people stand within 100 px, each peer set ends up holding the other 7, and the symmetric update makes sure each pair is recorded once, not twice.

**Why doesn't the voice go through our server?**
Today the server carries only names, positions and peer lists, never sound. The plan is for WebRTC to send the voice browser to browser, with the server only passing the setup notes (not built yet, Task 8), which means less delay and less load on the server.
