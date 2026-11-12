# 11 — Viva questions and short answers

*85 likely questions, grouped by topic. Each answer is short enough to say out loud. "Show:" names the file to open if the examiner asks to see the code. Longer explanations are in docs 00–10.*

Words used everywhere below:

- **Tick**: the server's timer that runs every 250 ms and decides who can hear whom (`server/signaling/tick.js`).
- **Peer**: someone I have a voice connection with. My **peer set** is the list of my peers, kept on the server.
- **Event**: a named Socket.io message, such as `player:move`. Its data is the **payload**.
- **Area**: a part of the map with a hearing type (open, private, silent, stage, lobby), such as a meeting room.

---

## A. Architecture

**1. What problem does ProxiSpeak solve?**
In a video call only one person can talk at a time and side conversations are impossible. ProxiSpeak is a 2D office in the browser: you hear the people standing near you, so several small conversations can happen at once, like in a real office.

**2. Why does the voice go browser to browser and not through your server?**
Cost and delay. With 50 people, a server that carried audio would receive and resend every voice. With **WebRTC** (the browser's built-in direct audio connection), the audio goes straight between the two browsers, so our free server only passes small text messages. Show: `client/src/rtc/rtcManager.js`.

**3. Then what does the server do?**
Four jobs: it keeps everyone's position in memory, sends all positions to the floor 10 times a second, decides every 250 ms who may talk to whom, and passes the WebRTC setup notes between those people only. It also signs people in and runs the office directory. Show: `server/signaling/index.js`.

**4. Why Socket.io and not plain web requests?**
Positions and voice notes must flow both ways at any moment. **Socket.io** keeps one connection open (a **WebSocket**), so the server can push `players:state` without being asked. It also reconnects by itself and has **rooms** (named groups of connections), which we use for floors. Show: `server/signaling/index.js`, `client/src/net/index.js`.

**5. Why three different speeds (60 FPS, 10/s, 4/s)?**
Drawing must be smooth, so it follows the screen (about 60 frames a second). Sending positions costs bandwidth, so 10 a second is enough, and the browser slides avatars between updates. Deciding who hears whom costs database queries and changes slowly, so 4 times a second is enough. Show: `shared/constants.js` (`MOVE_SEND_HZ`, `STATE_BROADCAST_MS`, `PROXIMITY_TICK_MS`).

**6. Where do positions live, and why not in MongoDB?**
In a JavaScript `Map` in the server's memory. Moves arrive up to 10 times a second per person; writing each one to a database would be 500 writes a second for 50 people. Instead the tick writes all movers in **one** `bulkWrite` (a single database request carrying many writes) every 250 ms. Show: `server/signaling/players.js`, `server/geo/geoEngine.js` (`upsertPositions`).

**7. What happens if MongoDB is down or not configured?**
The server still starts. It logs `nearby engine: fakeNearby` and measures distances in memory (`fakeNearby.js`) with the same answer format; the office directory runs from the demo data in memory; areas are checked in memory with `areaAt`. Nothing is saved across a restart then. Show: `server/index.js` (`startGeoEngine`), `server/signaling/fakeNearby.js`.

**8. What does "contract-first" mean in your project?**
Every event name, payload, function and database shape was written in `CONTRACTS.md` before the code. Event names and numbers live once in `shared/events.js` and `shared/constants.js` and are imported by both server and browser, so four people could build modules separately with fake data. Show: `CONTRACTS.md`, `shared/`.

---

## B. Sign-in and single sign-on

**9. How does an employee sign in?**
They type their email. `POST /api/auth/employee` looks it up in the directory. If found, the server returns a signed token valid for 12 hours; if not, 404 "Not in the Infotact directory". Show: `server/auth/routes.js`.

**10. What is inside the token?**
Two parts joined by a dot: `payload.signature`. The payload is base64url text of `{ sub: 'emp-riya', role: 'lead', admin: false, exp: <time in ms> }`. The signature is HMAC-SHA256 of that payload with the server's `AUTH_SECRET`. Show: `server/auth/token.js`.

**11. How does the server catch a forged or changed token?**
It recomputes the HMAC of the payload part with its secret and compares it with the signature part. If someone changes `admin: false` to `true`, the recomputed signature is completely different, so `verifyToken` returns null. Only someone who knows `AUTH_SECRET` can make a matching signature. Show: `server/auth/token.js` (`verifyToken`).

**12. Is the token encrypted?**
No. It is **signed**, not encrypted: anyone can base64-decode and read the payload. That is fine because it holds no secret (an id, a role, an expiry). What it can't be is changed.

**13. Why `timingSafeEqual`?**
A normal string compare stops at the first different letter, so a wrong guess that matches more letters takes slightly longer. An attacker could measure that. `timingSafeEqual` always takes the same time. Show: `server/auth/token.js`, `server/auth/secrets.js`.

**14. Employees have no password. Isn't that insecure?**
Yes, for a real product. It is a demo choice: anyone who knows a directory email can sign in as that person. The page says so ("In production, identity comes from Infotact's dashboard (single sign-on)"). The token and every server-side check are real; only the "who are you?" step is simplified. Show: `client/src/app/SignInPage.jsx`, `server/auth/routes.js`.

**15. How is the admin page protected?**
Admin sign-in needs the admin email and `ADMIN_PASSWORD` (compared as SHA-256 fingerprints with `timingSafeEqual`). Every `/api/admin/*` route runs `requireAdmin`, which checks on the server that the token has `admin: true` **and** that the employee's role is still `admin`. An employee token never has `admin: true`, even for the admin person. Show: `server/auth/middleware.js`.

**16. What if someone copies a token?**
It keeps working until it expires (12 h), because tokens are **stateless** (the server keeps no list of them). "Sign out" only clears the tab. A real system would add short expiry plus a refresh step, or a revoke list. Known issue, written down in `docs/build-progress.md`.

**17. What happens if `AUTH_SECRET` is not set?**
The server makes a random secret for that run and warns. Everything works, but every restart signs everyone out (old signatures no longer match). Show: `server/auth/secrets.js`.

**18. How would this become single sign-on from Infotact's dashboard?**
Not built. Design: the dashboard already knows who is signed in; it would send the user to ProxiSpeak with a short-lived signed statement ("this is riya@infotact…"). Our server would verify that statement with Infotact's key instead of looking up a typed email, then issue our own token exactly as now. Everything after the token stays the same. See `01-auth-and-sso.md`.

---

## C. Signaling, the tick and peer sets

**19. What happens when a browser joins?**
The server rejects a second join from the same tab, validates the payload (a non-empty name, or a valid token), adds the player at the spawn point with `moved = true`, puts the socket in its floor's room, replies `world:init` (my id, spawn, the others), and tells the others `player:joined`. Show: `server/signaling/index.js` (`handleJoin`).

**20. Why does a new player start with `moved = true`?**
The tick only checks players who moved. Two people who join at the same spot and stand still would otherwise never connect, although they are 0 px apart. Show: `server/signaling/players.js` (`addPlayer`).

**21. How do you validate a move?**
`x` and `y` must be real numbers (not text, not NaN), between 0 and 4096; `dir` must be one of up/down/left/right. Then: not into a closed wing (`WING_CLOSED`), and not faster than running speed (the speed check). Only `x`, `y`, `dir` are copied, so extra fields never reach the store. Show: `server/signaling/index.js` (`handleMove`, `isValidMove`).

**22. Explain the speed check.**
A **movement budget**, like a fuel tank in pixels. It fills at 440 px/s (running speed) and holds at most 250 ms of running, 110 px. Each move spends its length. A move longer than the budget is shortened to the budget, never refused, so a slow network can't get anyone stuck. Allowed jumps: the first move after joining, my own desk (Ctrl+D), the lobby spawn, the elevator. Show: `server/signaling/moveCheck.js`.

**23. What are the steps of one tick?**
(1) Collect the players who moved. (2) One `bulkWrite` of their positions per floor. (3) One `$geoWithin` aggregate per floor: who is in which area. (4) `findNearby` within 140 px for every mover, in parallel. (5) For each mover, decide every link with the room rules and the 8-peer cap. (6) Send one `peers:update` per affected browser. Show: `server/signaling/tick.js` (`runProximityTick`).

**24. What is in `peers:update`?**
`{ entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }`. `mode` is how I hear that person: `full` (same room, or the stage speaker) or `falloff` (by distance). `changed` lists people I stay connected to whose mode changed. A browser never gets `left` and `entered` for the same person in one message. Show: `server/signaling/tick.js` (`sendPeerUpdates`).

**25. Why connect at 100 px but disconnect only at 140 px?**
With one line at 100 px, someone standing at 99–101 px would connect, disconnect, connect… every tick. With a 40 px gap (called **hysteresis**: a different threshold for turning on and off), small wobbles change nothing. Example: connected at 90 px, drift to 130 px → still connected; 150 px → disconnected. Show: `server/geo/canHear.js` (`byDistance`).

**26. Are peer sets symmetric?**
Yes. `connectPair` adds each person to the other's set; `disconnectPair` removes both. Modes can differ by direction (on a stage the audience hears the speaker `full`, the speaker hears the audience `falloff`). Show: `server/signaling/tick.js`.

**27. How do you enforce the 8-peer cap?**
For **both** people of a new link. If someone already has 8, their least relevant link is dropped, but only if it ranks worse than the new one. Rank: `full` links first, then `falloff`, then links only the other person needs; nearest first inside each group. Test: 12 robots on one spot → counts 8 8 8 8 8 8 8 8 8 8 8 6. Show: `server/signaling/tick.js` (`makeRoomFor`, `rankOf`), `server/scripts/peer-cap-test.js`.

**28. Why can't a browser send WebRTC notes to anyone it likes?**
The server relays a `rtc:signal` only if the receiver is in the sender's peer set; otherwise it answers `BAD_SIGNAL`. It also writes `from` itself from the socket id, so a browser can't pretend to be someone else. Show: `server/signaling/index.js` (`handleSignal`).

**29. What if a tick is still waiting for MongoDB when the next one is due?**
A flag (`tickIsRunning`) skips the new one. Two ticks never change the peer sets at the same time; a slow tick delays the next, it doesn't pile up. The `moved` flags are cleared before the waiting starts, so a move that arrives meanwhile is picked up next time. Show: `server/signaling/tick.js` (`startProximityTick`).

**30. How are floors kept apart?**
Each floor is a Socket.io room named by its floor id (`floor-1`, `floor-2`). Broadcasts go per room, each floor has its own geo engine, and the tick ignores people in other rooms. Test: two people at the same x, y on different floors never see or hear each other. Show: `server/signaling/officeRooms.js`, `server/scripts/floor-test.js`.

**31. What happens after a network blip or server restart?**
Socket.io reconnects by itself with a **new** socket id. `net` sends `player:join` again with the same token, the floor and the status it had. The page gets the fresh `world:init` through `onRejoin`, rebuilds the WebRTC manager for the new id and remounts the world. Others get `player:left` (old id) and `player:joined` (new id). Show: `client/src/net/index.js` (`rejoin`), `server/scripts/reconnect-test.js`.

**32. What does Do Not Disturb do?**
Turning it on hangs up all of that person's connections at once (both sides get `left`), and `canHear` returns "not audible" whenever either person is on DND, so the tick never reconnects them. Show: `server/signaling/index.js` (`handleStatus`), `server/geo/canHear.js`.

---

## D. WebRTC, STUN and TURN

**33. Explain offer, answer and ICE.**
The **offer** is a text (SDP) from one browser: "these are the audio formats I can send and receive". The **answer** is the other browser's reply with its choice. **ICE candidates** are possible network addresses each side can be reached at. Both sides exchange all of these through our server, then try address pairs until one works. Show: `client/src/rtc/rtcManager.js`.

**34. Who sends the offer?**
The person whose id is smaller in plain string comparison (`'a1' < 'b7'`, so `a1` offers). If both offered at once ("glare"), the handshake would break. Show: `client/src/rtc/rtcManager.js` (`handlePeersUpdate`).

**35. What is the early-candidate queue?**
A candidate can only be added after the other side's description is set. Candidates sometimes arrive before that. We keep them in `pendingCandidates` and add them right after `setRemoteDescription`. Without it, early candidates are lost and the connection may never form. Show: `client/src/rtc/rtcManager.js` (`addOrQueueCandidate`, `flushPendingCandidates`).

**36. STUN versus TURN?**
STUN only tells a browser its public address, so two browsers can try to connect directly; it carries no audio. TURN is a relay that carries the audio when no direct path works. Example: a laptop on home Wi-Fi and a phone on mobile data often can't reach each other directly; TURN passes the voice along. We use Google's STUN and Metered's TURN. Show: `client/src/rtc/rtcManager.js` (`buildIceServers`).

**37. Why four TURN addresses?**
The same Metered relay on UDP port 80, TCP port 80, port 443 and TLS on 443. Strict networks often block all but one, so the browser tries each. Show: `.env.example`, `docs/deploy.md`.

**38. The TURN password is in the browser code. Is that a leak?**
Every `VITE_` value is baked into the downloaded JavaScript, so yes, anyone can read it. That is normal for TURN in a browser app; the risk is someone using our relay quota. That's why the credential is made only for ProxiSpeak and can be deleted and replaced in Metered. Secrets like `MONGODB_URI` and `AUTH_SECRET` never get a `VITE_` name, so they never reach the browser. Show: `client/vite.config.js`.

**39. Why limit audio to 32 kbps?**
In a mesh, each connection carries its own copy of my voice. With 8 peers I upload 8 copies: 8 × 32 kbps = 256 kbps, fine for home internet. Opus (the WebRTC voice codec) is clear speech at 32 kbps. We set it with `RTCRtpSender.setParameters` once the connection is `connected`. Show: `client/src/rtc/rtcManager.js` (`limitAudioBitrate`).

**40. What happens if a connection fails?**
On `failed` the manager closes it; there is no automatic retry. Walking out of earshot and back in makes a fresh connection. Show: `client/src/rtc/rtcManager.js` (`onconnectionstatechange`).

**41. How does mute work?**
The microphone track is disabled (`track.enabled = false`), so every connection sends silence but stays open; unmuting is instant. Show: `client/src/rtc/rtcManager.js` (`setMuted`).

---

## E. MongoDB, geo queries and indexes

**42. Why a `2d` index and not `2dsphere`?**
`2dsphere` is for points on the Earth (longitude, latitude, distances in metres). Our map is a flat grid of pixels, so we need flat straight-line distance: `2d`. Show: `server/geo/models/Position.js`.

**43. Why `min: 0, max: 4096` on the index?**
A `2d` index accepts only -180 to 180 by default (it was built for longitude and latitude). Our pixels go up to 4096, so without the bounds saving a position fails. Our map is 3520 × 2560 px, inside the bounds. Show: `server/geo/models/Position.js`.

**44. What does the nearby query look like?**
`Position.find({ roomId, _id: { $ne: me }, loc: { $near: [x, y], $maxDistance: 140 } }, { loc: 1 })`. `$near` returns the points within 140 px, nearest first, using the 2d index. Show: `server/geo/geoEngine.js` (`findNearby`).

**45. What does `$geoWithin` do and where do you use it?**
It finds points inside a shape (`$box` rectangle or `$polygon`). We use it to find who stands in which area. `usersInArea` is one `find`; the tick uses `locateUsers`, one aggregate with a `$facet` of one `$geoWithin` per area. Show: `server/geo/areas.js`.

**46. Why do you shift the box by (12, 16)?**
A stored position is the avatar's top-left corner, but areas are drawn around the avatar's middle (`AVATAR_MIDDLE = { x: 12, y: 16 }`). "Middle inside the room" equals "top-left inside the room moved 12 px left and 16 px up". Example: Meeting room 2 `[[1408,128],[1760,608]]` becomes `[[1396,112],[1748,592]]`. Show: `server/geo/areas.js` (`shapeOf`).

**47. How do you prove the index is used?**
`.explain()` (MongoDB's report of how it ran a query). For `$near` (Pratik's audit): winning plan `FETCH → GEO_NEAR_2D (loc_2d_roomId_1)`, no `COLLSCAN` (a collection scan, reading every document). `IXSCAN` below means "walked the index". For `$geoWithin` (`explain-geowithin.js`): `PROJECTION_SIMPLE ← FETCH ← IXSCAN (loc_2d_roomId_1)`, 4 keys examined, 3 documents fetched, 3 returned out of 40. Show: `docs/geo-audit.md`, `server/geo/scripts/explain-geowithin.js`.

**48. How did you measure "under 20 ms"?**
`spatial-audit.js` seeds 50 positions and runs 10 rounds of 50 parallel `findNearby` calls, timing each with `performance.now()`. On local MongoDB (Pratik's laptop, 23 Oct): average 9.09 ms, worst 15.87 ms, full batch + 50 queries 15.36 ms on average. Show: `server/geo/scripts/spatial-audit.js`, `docs/geo-audit.md`.

**49. Does the `$facet` aggregate use the 2d index too?**
Honest answer: not the way the `find` does. MongoDB's documentation says the sub-pipelines inside `$facet` cannot use indexes. The first stage, `$match { roomId }`, can use the `roomId` index; then the `$geoWithin` checks run on that floor's documents in memory. With at most a few hundred people per floor that is cheap (the tick still averages 25–50 ms with 50 bots). The explain output proves the index for the single-area `find`, not for the aggregate. Show: `server/geo/areas.js` (`locateUsers`).

**50. How many database operations does one tick make?**
For 50 people moving on one floor: 1 `bulkWrite` + 1 aggregate + 50 `$near` queries ≈ 52 per tick, about 208 a second. Important: the team briefing notes the Atlas free tier allows about 100 operations a second, and the load test ran on local MongoDB. So 50 moving people on Atlas free is untested and may be throttled. The obvious fix, noted in `docs/load-test.md`, is one query per floor instead of one per mover. Show: `server/signaling/tick.js`.

**51. Which collections exist?**
`positions` (live positions, 2d index), `areas` (each floor's rooms as shapes), `rooms` (each floor's stored Tiled map with a version), and the directory: `employees`, `departments`, `floors`, `alerts`. Show: `server/geo/models/`, `server/office/models.js`.

---

## F. Audio

**52. What is the volume formula?**
A half-cosine curve: `gain = 0.5 × (1 + cos(π × d / 100))` for d below 100 px, 1 at 0 px, 0 at 100 px and beyond. Examples: 25 px → 0.85, 50 px → 0.50, 75 px → 0.15. Show: `client/src/audio/formulas.js` (`distanceToGain`).

**53. What is the left/right formula?**
`pan = dx / 80`, kept between -0.9 and +0.9, where `dx` = speaker's x minus my x. Example: 40 px to my right → 0.5; 100 px to my left → -0.9. Never fully one ear, which is more comfortable. Show: `client/src/audio/formulas.js` (`dxToPan`).

**54. Describe the Web Audio chain.**
For each voice: `MediaStreamSource → GainNode (volume) → StereoPannerNode (left/right) → speakers`. The world calls `mixer.update(frame)` every frame with everyone's position, and the mixer sets each gain and pan. Show: `client/src/audio/mixer.js`.

**55. Why is there a muted `<audio>` element for each voice?**
A Chrome quirk: a remote WebRTC stream does not flow into Web Audio unless it is also attached to a media element. We attach it to a **muted** element so it flows, while the real sound comes only from the mixer. A normal unmuted element would play every voice at full volume regardless of distance. Show: `client/src/audio/mixer.js` (`addPeer`).

**56. What volume is "full" mode, and why 0.77?**
A constant `distanceToGain(32) ≈ 0.77`: the loudness of talking face to face one tile apart. Not 1.0, so a meeting room is not louder than standing next to someone. Show: `client/src/audio/mixer.js` (`FULL_MODE_GAIN`).

**57. How do walls muffle voices?**
On open floor the browser walks the tiles on the straight line between two people (`isWallBetween`). If a wall tile is on it, the voice plays at 30 % of its volume (`WALL_MUFFLE_GAIN`). It is only a volume drop, not a sound filter. Inside rooms the server's rules decide instead. Show: `client/src/world/soundWalls.js`, `client/src/audio/mixer.js`.

**58. How do you avoid clicks and jumps in volume?**
Every change uses `setTargetAtTime`, which glides towards the new value. Normal walking uses a 50 ms time constant; a mode change, a wall change or a new voice uses 100 ms, which reaches about 95 % in 300 ms (`AUDIO_FADE_MS`). Show: `client/src/audio/mixer.js`.

**59. Why does the page sometimes say "Click anywhere to turn on sound"?**
Browsers keep sound off until the person clicks on the page. After a reload of `#/office` there was no click yet, so the mixer's audio context stays "suspended" until the first click. Show: `client/src/app/OfficePage.jsx`, `client/src/app/useVoiceSession.js`.

---

## G. Rooms and hearing rules

**60. What area types are there?**
`open` and `lobby` (hear by distance), `private` (everyone inside hears everyone inside, constant volume), `silent` (nobody hears anybody), `stage` (the speaker on the platform reaches the whole hall). The generated floor has 66 areas: 1 stage, 47 private, 2 silent, 15 open, 1 lobby. Show: `server/office/layout.json`, `shared/constants.js` (`ZONE_TYPES`).

**61. State the private-room rule.**
If both people are in the same private area: audible at `full`, at any distance. If only one of them is in a private (or stage) area: never audible, in or out. Test: Boardroom, two people 639 px apart → connected, full; someone outside 54 px away → connected to nobody inside. Show: `server/geo/canHear.js`, `server/scripts/area-test.js`.

**62. The stage: the speaker can't hear a far audience member, so why connect them?**
A WebRTC connection carries sound both ways, and the audience member needs to hear the speaker. So the link is made when **either** person can hear the other (`shouldConnect`); the speaker's mixer gets that person in `falloff` mode, and at that distance the formula gives volume 0. Show: `server/geo/canHear.js` (`shouldConnect`), `server/signaling/tick.js` (`describeLink`).

**63. Who decides which area I'm in, the browser or the server?**
The server, always. For hearing: the tick's `$geoWithin` aggregate (or `areaAt` in memory without MongoDB). For chat: `areaAt` in memory at send time. The browser also works out its area, but only to dim the map and open the chat panel. Show: `server/signaling/tick.js` (`locateRoom`), `server/signaling/areaChat.js`.

**64. How does area chat work?**
`chat:send { text }` → the server finds the sender's area from the position it holds, rejects open floor (`BAD_CHAT`), and sends `chat:message` only to people standing in the same area. Messages are not stored; someone walking in later sees nothing older. Limit 500 characters. Show: `server/signaling/areaChat.js`.

**65. Is there a known disagreement between chat and hearing?**
Yes. The tick uses the stored areas through MongoDB every 250 ms, chat uses the same areas in memory at send time. At a doorway they can disagree for up to one tick. Written down in `docs/build-progress.md`.

---

## H. Desks, departments, tiers and floors

**66. What is the desk rule?**
For a new hire in department D, in order: (1) a free desk in D's own block; (2) grow the block into the free desk right next to it; (3) any free, unreserved desk elsewhere on the floor (it joins D's block); (4) a hot desk, plus one admin alert per floor; (5) "floor full", no desk. Show: `server/office/desks.js` (`chooseDesk`).

**67. Why are desks numbered in a "snake"?**
So desk n and n + 1 are always neighbours. "Grow into the next desk" then always means "the desk beside the block". Show: `server/scripts/office-rules-test.js` (check 0b).

**68. What are tiers?**
A floor has four neighbourhoods (wings) A–D of 25 desks. The tier is the number of open wings: 25 people → A, 50 → A + B, 75 → A–C, 100 → all four. It is the smallest tier that fits the headcount and every wing holding a used or reserved desk, and it only grows. Show: `server/office/tiers.js`.

**69. What stops someone walking into a closed wing?**
Two checks. The browser treats it as a wall (`isBlockedByOverlay`). The server refuses the move with `WING_CLOSED`, because we never trust the browser. Show: `server/signaling/officeRooms.js` (`isMoveIntoClosedWing`).

**70. What happens when Floor 1 is full?**
New hires get hot desks (14 exist), and one "Floor 1 is full" alert is kept up to date with the count. The admin adds Floor 2 and moves departments there; `planRebalance` gives each moved department a new block, frees its old desks and seats the remaining hot-deskers. People online are moved to the new floor at once. Show: `server/office/rebalance.js`, `server/office/store.js` (`applyFloorMoves`).

**71. Why keep the directory in memory?**
Joins and moves ask "who is this token's employee?" and "is this wing closed?". Asking MongoDB every time would be slow, so the small directory lives in Maps, and the store writes changed documents to MongoDB after each admin action, never per move. Show: `server/office/store.js`.

**72. Can the admin change the map?**
Yes: Admin → Layouts → upload a Tiled JSON (up to 5 MB). The server checks it (orthogonal, 32 px tiles, at most 128 × 128 tiles, embedded tilesets, required layers, a valid type and name on every zone), saves it as the next version in `rooms`, replaces the floor's areas, and sends `layout:update` so open browsers reload. Desks stay those of the generated layout. Show: `server/geo/rooms.js`, `server/geo/routes.js`.

---

## I. Performance and the 50-bot test

**73. How did you load-test?**
`server/scripts/load-test.js`: 50 bots, each a real Socket.io client signed in as a directory employee, join floor-1 and walk at 220 px/s, sending 10 moves a second with the browser's collision rules. Two modes: spread over the floor, or packed within 280 px of the lobby. The server logs tick timing every 5 s. Show: `server/scripts/load-test.js`, `docs/load-test.md`.

**74. What were the results?**
Spread: tick average 25–28 ms, worst 46 ms, 0.8 peers per bot. Packed: average 35–49 ms, worst 168 ms, average 5.8 peers, maximum exactly 8. No server errors. Each bot received `players:state` about 9.3 times a second. Local MongoDB on a Windows laptop. Show: `docs/load-test.md`, `docs/load-test-runs.txt`.

**75. Is a 168 ms tick a problem?**
No: the tick runs every 250 ms, so even the slowest one finished before the next was due, and the `tickIsRunning` flag means a slow tick delays, it doesn't overlap. It does mean a new voice can take up to about 0.4 s to start in a crowd.

**76. What did the load test NOT test?**
The bots send positions only: no microphones and no WebRTC. So it measures the server, not audio quality or browser upload. It ran on local MongoDB, not Atlas. And bot names repeat (26 directory people for 50 bots).

**77. What does "140 FPS" mean?**
With the packed test running and 52 people drawn, headless Chrome drew 135–140 frames a second. Headless Chrome is not tied to a 60 Hz screen, so it shows headroom: a normal browser draws at 60 FPS and each frame takes well under its 16.7 ms budget. Show: `docs/screens/33-v6-fps-50-bots.png`.

---

## J. Deployment

**78. How is it deployed?**
`render.yaml` (a Render **Blueprint**) creates two services from branch `aryan`: `proxispeak-server` (Node web service, free plan, health check `/api/health`) and `proxispeak-client` (static site from `client/dist`). MongoDB is an Atlas free cluster; TURN is Metered's free plan. Show: `render.yaml`, `docs/deploy.md`.

**79. Which environment variables are there, and who reads them?**
Server: `MONGODB_URI`, `CLIENT_ORIGIN` (the **CORS** allow-list: the web page addresses the browser may call our server from), `AUTH_SECRET`, `ADMIN_PASSWORD`, `PORT` (set by Render), `NODE_VERSION`. Client, baked in at build time: `VITE_SERVER_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Show: `.env.example`, `render.yaml`.

**80. What is a cold start and how do you handle it before a demo?**
Render's free server sleeps after 15 minutes without visitors; waking takes about a minute and the first join may time out. Open `/api/health` a minute before the demo and wait for it to answer. A restart also forgets everyone's positions (they live in memory); open tabs re-join by themselves. Show: `docs/deploy.md`.

**81. How do you reset the demo?**
`node server/office/reset-demo.js --yes` deletes all employees, departments, floors and alerts and re-seeds the 16 demo people + admin, then restart the server. Without `--yes` it refuses. Show: `server/office/reset-demo.js`.

---

## K. Scaling, Redis, limitations and next steps

**82. What breaks if you run two server copies today?**
Everything that lives in one process's memory: the players Map, the peer sets, the office directory, the Socket.io rooms. A person on copy 1 would never see or hear a person on copy 2. The plan is Redis; it is **not built on this branch**. See `12-redis.md`.

**83. Why can a stage talk reach only 8 listeners?**
It's a **mesh** (every pair has its own connection), and the cap is 8 connections per person, so the speaker connects to their 8 most relevant listeners. More would need an **SFU** (a media server that receives each voice once and forwards it to many listeners). Same limit for any very large room; none on this map holds more than 12.

**84. What are the biggest limitations?**
(1) Employee sign-in has no password (demo). (2) One server process. (3) 8-peer mesh limit. (4) The tick makes one `$near` per mover, which may exceed the Atlas free tier's operations limit at 50 people. (5) The first move after a join is free, so a reconnect allows one jump. (6) Area chat has no rate limit. (7) Uploaded layouts can't move desks. (8) Ctrl+D jumps, no path-finding.

**85. What would you do next?**
Real SSO from Infotact's dashboard; the Redis adapter for two server copies; one nearby query per floor instead of per mover; an SFU for the stage; rate-limit chat; run the load test against Atlas.
