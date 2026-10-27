# How the signaling server works (v2)

Module 1 · Person 1 (Aryan) · Covers the code on branch `aryan` up to Task 10.

Files described here: `server/index.js`, `server/signaling/index.js`, `server/signaling/players.js`, `server/signaling/tick.js`, `server/signaling/fakeNearby.js`, `client/src/net/index.js`, `client/src/rtc/mic.js`, `client/src/rtc/rtcManager.js`.
Event names and payloads come from `CONTRACTS.md` (v3), sections 4–7.

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

The **signaling server** is our Node.js program that every browser stays connected to; it works like a post office. It keeps a list of everyone in the office and their positions in memory, and handles people joining, moving and leaving. Ten times a second it sends everyone's positions to every browser, and four times a second it checks who is near whom and tells each browser who came close or walked away. It never carries anyone's voice; it only passes the short setup notes that let two browsers connect to each other directly (section 7).

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
| `net.onSignal(cb)` | Calls `cb` on every `rtc:signal` |
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

**Where "who is near" comes from.** At start-up, `server/index.js` tries to start Person 2's geo engine (MongoDB) and passes the result to the tick:

- If `MONGODB_URI` is set in `.env`, it waits for `connectDb` for at most 3 seconds (`Promise.race` against a timer), then calls `createGeoEngine({ roomId: 'office-1' })`. The tick then saves the moved players' positions with one `geo.upsertPositions([{ id, x, y }])` call before asking `geo.findNearby`. When someone disconnects, `geo.removeUser(id)` deletes their saved position.
- If `MONGODB_URI` is missing, or connecting fails or takes longer than 3 seconds, the server logs `[server] geo engine not available, using fakeNearby: <reason>` and uses `geo = null`. The tick then uses `fakeNearby.js`, which measures straight-line distance (`Math.hypot`) from the in-memory Map and answers in the same format.

The server always logs which one is in use. `computePeerChanges` always comes from `fakeNearby.js`, for both paths: it is a pure function, so it only needs the distances, wherever they came from (Person 2's identical, tested copy is `server/geo/peerChanges.js` on `dev`). On this branch `server/geo/` is still the stub, so without a `.env` the server uses `fakeNearby`.

If `upsertPositions` fails (for example MongoDB went down), that tick is skipped and logged, and the moved flags are switched back on, so those players are checked again next tick. A failed `removeUser` is only logged.

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

## 7. The WebRTC handshake (Tasks 7–10)

Words first:

- **WebRTC** is the browser's built-in way to send audio straight to another browser. One **RTCPeerConnection** is one direct connection to one person; each browser makes one per nearby person.
- The **offer** is the first note: "I want to send you audio; here are the audio formats I support". The **answer** is the reply: "okay, here are mine". Both carry their details as **SDP** text, which we never read, only pass along.
- An **ICE candidate** is a note saying "here is a network address where you might reach me". Each browser finds a few and sends each one as soon as it is found.
- **STUN** is a free helper server (we use Google's, `stun:stun.l.google.com:19302`) that tells a browser its public internet address, so it can offer that address as a candidate. A **TURN** relay is added only if `VITE_TURN_URL` is set, and it isn't yet.

### Example: Riya ('a1') and Sam ('b7')

1. **Microphone.** On the `?lab=rtc` page each person clicks "Join with mic". `getMicStream()` (`mic.js`) asks for the microphone with echo cancellation and noise suppression. If the page is not https or localhost, permission is denied, or there is no microphone, the page shows a clear error and does not join. Then `net.connect` joins, and the rtc manager is created straight away, so it can't miss the first `peers:update`.
2. **They come close.** The tick sends both browsers `peers:update` with the other person in `entered`. Each browser creates a connection and adds its microphone track to it.
3. **Who sends the offer.** `'a1' < 'b7'` (plain string comparison), so only Riya creates the offer, stores it as her own description (`setLocalDescription`), and sends `{ type: 'offer', sdp }`. Sam waits. If both sent an offer at once ("glare"), the setup would break.
4. **The answer.** Sam receives the offer, stores it as the other side's description (`setRemoteDescription`), creates the answer, stores it, and sends `{ type: 'answer', sdp }`. If the offer reaches Sam before his own `peers:update`, he creates the connection right then. Riya uses the answer only if she is waiting for one (her connection is in the `have-local-offer` state).
5. **ICE candidates.** Both browsers send each candidate they find as `{ type: 'candidate', candidate }`. The browsers try the addresses until one works, and the connection state goes `new` → `connecting` → `connected`.
6. **Voices.** When the other person's audio arrives (`ontrack`), the manager calls `onRemoteStream(id, stream)` once, and the lab page plays it in an `<audio>` element.
7. **They walk apart.** At more than 140 px, `peers:update` lists the other person in `left`. Both browsers close the connection and call `onPeerClosed(id)`, and the page removes that `<audio>`. If a connection reaches `failed` (no address worked), it is closed the same way. There is no automatic retry yet.

### The early-candidate queue

A candidate can only be added after the other side's description is set, but candidates can arrive while `setRemoteDescription` is still working. Example: Sam's first candidate reaches Riya while she is still storing his answer. So a candidate that arrives too early waits in that connection's `pendingCandidates` list, and the whole list is added as soon as the description is set. A candidate from someone we have no connection with (they walked away a moment ago) is ignored with a warning.

### What the server does with the notes

The server only passes notes on (`handleSignal` in `server/signaling/index.js`) and never reads the SDP:

1. The sender must have joined, otherwise `NOT_JOINED`.
2. The payload must be `{ to, data }`, with `to` a string and `data.type` one of `offer`, `answer`, `candidate`. An offer or answer needs a string `sdp`; a candidate needs a `candidate` object. Otherwise `BAD_SIGNAL`.
3. `to` must be online and in the sender's peer set (`arePeers` in `tick.js`), that is, within earshot. Otherwise `BAD_SIGNAL`, with a message saying which check failed.
4. It delivers `{ from, data }` to that one browser. `from` is always the sender's socket id; a `from` sent by the browser is never read. Only `type` and `sdp` (or `type` and `candidate`) are copied into `data`.

```
  Riya's browser ('a1')               Server                    Sam's browser ('b7')
        |<-- peers:update entered b7 --|-- peers:update entered a1 -->|
        |   (a1 < b7, so Riya offers)  |                              |
        |-- rtc:signal {to b7, offer} >|-- rtc:signal {from a1, ...} >|
        |< rtc:signal {from b7, ...} --|<- rtc:signal {to a1, answer}-|
        |<======== candidates, both ways, by the same path ==========>|
        |                              |                              |
        |<============ voice, directly browser to browser ===========>|
        |                  (never through the server)                 |
```

### Mute

`setMuted(true)` switches off (`enabled = false`) the microphone track that every connection shares. The connections stay open and send silence, so unmuting is instant.

---

## 8. Not built yet

- **The awkward cases, Task 11:** no automatic retry when a connection fails, no special handling of a page refresh, and no TURN settings yet.
- **Person 4's mixer, Week 3:** the lab plays each voice in a plain `<audio>` element at full volume. Volume by distance and left/right panning come from the mixer later.

---

## 9. Viva answers

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
WebRTC sends the voice browser to browser. The server only passes the setup notes (offer, answer, ICE candidates), so there is less delay and less load on the server.

**What are the offer, answer and ICE candidates?**
The offer and answer agree on the audio formats; ICE candidates share possible network addresses. They travel through our server as `rtc:signal` notes.

**How do you stop both browsers sending an offer?**
Only the person with the smaller id (plain string comparison) sends it. The other only answers.

**Why queue ICE candidates?**
A candidate can't be added before the other side's description is set, and candidates can arrive before that. Queued candidates are added as soon as it is set; without the queue, connections would fail at random.

**Why does the server refuse notes to people who are not near?**
A voice connection should only exist within earshot. Checking the peer set also stops one browser from sending notes to anyone in the office.

**Why does the microphone need HTTPS?**
Browsers only allow `getUserMedia` on secure pages (https) or on localhost. `getMicStream` checks `window.isSecureContext` and says so clearly.
