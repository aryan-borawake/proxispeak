# 00 — ProxiSpeak in one picture

*For the team lead's viva. Every claim here was checked against the code on branch `aryan` (12 Nov 2026, CONTRACTS.md v6). Code paths are given so you can open the file when the examiner asks.*

---

## 1. The 2-minute version

Imagine 30 people in a video call. Only one person can talk at a time, and side chats are impossible. In a real office, you walk over to someone's desk and talk quietly while others do the same across the room.

ProxiSpeak puts that office in the browser:

- You sign in and appear as a small character, an **avatar**, on a top-down office map.
- You walk with the arrow keys.
- When you come within **100 px** of someone (about three floor tiles), your two microphones connect and you hear each other.
- Their voice gets louder as you get closer and comes from the left or right ear depending on where they stand.
- Inside a meeting room, everyone in the room hears everyone at the same volume, and nobody outside hears in.

**Proximity voice chat** is the name for this idea: who you hear depends on how close you stand.

The rule behind the design: the server decides *who may talk to whom*; the voice itself goes straight from browser to browser and never passes through our server.

---

## 2. One story from start to end

The people: **Riya** (`riya@infotact.demo`, Engineering) and a colleague we call **Sam**. Sam is a stand-in name for the story; the demo directory has no Sam, so in a live demo use `arjun@infotact.demo` as the second person.

1. **Riya opens the site.** The browser downloads the built React app from the Render static site. She sees the landing page (`#/`) and clicks "Enter the Infotact office".
2. **She signs in.** She types her email. The browser sends `POST /api/auth/employee { email }`. The server finds her in the employee directory and returns a signed **token** (a short text pass that proves who she is; it works for 12 hours). See `docs/theory/01-auth-and-sso.md`.
3. **The lobby page.** She picks an avatar colour and tests her microphone (a level meter moves). She clicks "Join office". That click lets the browser start sound, and the browser asks for microphone permission.
4. **She joins.** The browser sends the Socket.io event `player:join { token, avatarColor }`. **Socket.io** is a library that keeps one live, two-way connection open between a browser and the server, so either side can send a message at any time. The server checks the token, puts her in the room `floor-1`, and replies `world:init` with her id, her start point (the lobby, x 1632, y 2104) and everyone already on the floor.
5. **She walks.** Each frame her avatar moves `220 px/s × time since the last frame`. At 60 frames a second that is about 3.7 px per frame. At most 10 times a second the browser sends `player:move { x, y, dir }`.
6. **Everyone sees her move.** Every 100 ms the server sends `players:state` (all positions on floor 1) to everyone on floor 1. Each browser slides the other avatars smoothly towards their new positions.
7. **The server notices Sam.** Every 250 ms the server's **proximity tick** (a timer that asks "who can hear whom?") runs. It saves positions to MongoDB in one batch, asks MongoDB who is within 140 px of Riya, and applies the room rules. Sam stands 40 px to her right in the lobby, which counts as open floor, so the rule says "audible, mode `falloff`" (volume falls with distance). Both browsers get `peers:update { entered: [{ id, mode: 'falloff' }] }`.
8. **The browsers connect directly.** The browser whose id sorts first sends an **offer** (a text listing the audio formats it can send). The other sends an **answer**. Both send **ICE candidates** (possible network addresses). These notes travel through our server, but only between people the tick paired. Then the voice flows browser to browser over **WebRTC** (the browser's built-in system for direct audio between two browsers). See `03-webrtc-stun-turn.md`.
9. **She hears Sam on her right.** Her **mixer** (the audio code that sets each voice's volume and side) computes volume `0.5 × (1 + cos(π × 40 / 100)) ≈ 0.65` and pan `40 / 80 = 0.5` (half-way to the right ear). See `05-audio.md`.
10. **They walk into Meeting room 2.** On the next tick, MongoDB's `$geoWithin` query reports that both stand inside the area `meeting-2`, which is `private`. The rule changes their mode to `full`, and both get `peers:update { changed: [{ id, mode: 'full' }] }`. The mixer fades Sam to a constant volume (0.77) over 300 ms, so they can stand at opposite ends of the 352 × 480 px room and still hear each other the same. Riya's screen dims everything outside the room, the top bar shows "Meeting room 2 (6-8) · PRIVATE", and an area chat panel opens. A third person in the corridor, 30 px from the wall, hears nothing. See `08-rooms-and-hearing.md`.

---

## 3. The architecture

```
 BROWSER (one per person)                     RENDER WEB SERVICE                     MONGODB ATLAS
 client/src/                                  server/                                (cloud database)
 ┌──────────────────────────────┐            ┌───────────────────────────────┐      ┌─────────────────────┐
 │ app/   React pages           │  REST      │ index.js   Express + Socket.io │      │ positions  (2d index)│
 │ world/ WorldCanvas, 60 FPS   │  /api/...  │ auth/      tokens, admin check │      │ areas, rooms         │
 │ net/   Socket.io client      │◄──────────►│ signaling/ join, move,         │─────►│ employees,           │
 │ rtc/   one RTCPeerConnection │  events    │            100 ms broadcast,   │ 4×/s │ departments,         │
 │        per nearby person     │  (Socket.io)│           250 ms tick         │      │ floors, alerts       │
 │ audio/ mixer (Web Audio)     │            │ geo/       $near, $geoWithin,  │      └─────────────────────┘
 └──────────────┬───────────────┘            │            canHear rules       │
                │                            │ office/    directory in memory │
                │                            └───────────────────────────────┘
                │ voice: WebRTC, browser to browser (P2P)
                ▼
         OTHER BROWSER
           ▲        ▲
           │        └── TURN (Metered): relays the voice when no direct path works
           └─────────── STUN (Google): tells each browser its public address
```

In words: each browser talks to the server over Socket.io (events) and plain web requests (REST). The server keeps everyone's position in memory, writes it to MongoDB Atlas 4 times a second, and asks MongoDB who is near whom. The voice does not go through the server: it goes straight between two browsers, helped by a STUN server to find addresses and, when needed, relayed by a TURN server.

Words used in the diagram:

- **REST route**: a normal web address the browser calls, such as `GET /api/health`, that answers once with data.
- **P2P** (peer-to-peer): two browsers send data straight to each other, with no server in the middle.
- **STUN** server: a small public helper that tells a browser "this is your address as the internet sees it".
- **TURN** server: a relay that receives the voice from one browser and passes it to the other when the two can't reach each other directly.
- **Render**: the hosting company that runs our server and serves our web page.
- **MongoDB Atlas**: MongoDB's cloud service. **MongoDB** stores data as JSON-like documents.
- **Metered**: the company whose free TURN relay we use.

Which folder is which module:

| Folder | Module | Original owner |
|---|---|---|
| `server/index.js`, `server/signaling/`, `server/auth/`, `server/office/`, `client/src/net/`, `client/src/rtc/`, `client/src/app/`, `shared/` | Signaling, WebRTC, the office product | Aryan (Person 1) |
| `server/geo/` | Geospatial engine (MongoDB) | Pratik (Person 2); v6 area files added by Aryan |
| `client/src/world/`, `client/public/maps/` | 2D world (canvas) | Anjali (Person 3); v5/v6 extensions by Aryan |
| `client/src/audio/` | Spatial audio | Koushik (Person 4); v6 modes, fades, muffling by Aryan |

---

## 4. The tech stack

| Piece | What we use | Why (one line) |
|---|---|---|
| Page framework | **React** (a library for building pages out of small components) with **Vite** (a fast build tool) | The team knows React; Vite rebuilds instantly while we code. |
| Drawing | **HTML5 Canvas** (a drawing surface the browser gives JavaScript) | Draws hundreds of tiles and avatars per frame, faster than HTML elements. |
| Map | **Tiled** (a free map editor) JSON format, 32 px tiles | A standard format; the generator and the admin upload both use it. |
| Live messages | **Socket.io** over a **WebSocket** (one connection that stays open) | Events both ways, automatic reconnect, and **rooms** (named groups of connections) per floor. |
| Web server | **Node.js** (JavaScript on the server) + **Express** (a small library for web routes) | Same language as the browser; shared constants file for both sides. |
| Voice | **WebRTC** | Built into every browser; audio goes browser to browser, so our server carries no audio. |
| Volume and direction | **Web Audio API** (the browser's sound-processing system) | A gain node and a stereo panner per voice, changed 60 times a second. |
| Database | **MongoDB** with **Mongoose** (a library that describes documents and talks to MongoDB) | Has a ready-made **2d index** (a structure that makes "who is near this point?" fast) for flat x, y coordinates. |
| Hosting | Render (server + static site), MongoDB Atlas (free M0 cluster), Metered (free TURN) | All have free plans; Render deploys from `render.yaml`. |
| Sign-in | HMAC-signed tokens with Node's built-in `crypto` | No extra package; the server can check a token without a database. |
| Scaling (planned) | **Redis** (a very fast in-memory store that can pass messages between programs) | Lets two server copies share users. **Not built yet**; see `12-redis.md`. |

---

## 5. The three speeds

ProxiSpeak runs three loops at three different speeds. Each speed is chosen for one job.

| Speed | What runs | Where | Constant |
|---|---|---|---|
| **60 FPS** (frames per second; really "the screen's rate") | Read keys, move my avatar, slide the others, draw the map and avatars, update every voice's volume and pan | Browser, `client/src/world/WorldCanvas.jsx` (`requestAnimationFrame`) | none (the screen decides) |
| **10 per second** | Browser sends my position (only if I moved); server sends all positions to everyone on the floor | `WorldCanvas.jsx` and `server/signaling/index.js` (`startStateBroadcast`) | `MOVE_SEND_HZ = 10`, `STATE_BROADCAST_MS = 100` |
| **4 per second** | The proximity tick: save positions, ask MongoDB, apply the room rules, send `peers:update` | `server/signaling/tick.js` | `PROXIMITY_TICK_MS = 250` |

Why three, and not one?

- **Drawing** must be smooth, or walking looks jerky, so it runs every screen frame.
- **Positions over the network** cost bandwidth: 50 people × 60 messages a second would be 3000 messages a second into the server. At 10 a second it is 500, and the browser hides the gaps by sliding avatars between updates (**interpolation**: moving smoothly from the old position towards the new one).
- **Who can hear whom** changes slowly (people walk at 220 px/s; it takes about half a second to cross the 100 px earshot) and each check costs database queries. 4 checks a second is fast enough to feel instant and cheap enough for the database.

Example with numbers: Riya runs at 440 px/s (Shift held). Between two ticks (0.25 s) she moves 110 px. So the worst delay before a new voice connects is one tick (250 ms) plus the WebRTC handshake.

---

## 6. Which doc covers what

| Doc | Read it to explain… |
|---|---|
| `00-overview.md` (this file) | The problem, the story, the architecture, the stack, the three speeds |
| `01-auth-and-sso.md` | Directory sign-in, the signed token step by step, admin password, how single sign-on would work |
| `02-signaling-and-tick.md` | Join, move, broadcast, the 250 ms tick, peer sets, 100/140 px, the 8-peer cap, floors as rooms, re-join |
| `03-webrtc-stun-turn.md` | Offer, answer, ICE, who offers, the early-candidate queue, STUN vs TURN, Metered, the 32 kbps limit |
| `04-mongodb-geo.md` | The positions collection, the 2d index, `$near`, `$geoWithin`, the explain output, the < 20 ms audit, Atlas limits |
| `05-audio.md` | The volume and pan formulas, the Web Audio chain, full mode, wall muffling, smoothing, the Chrome trick |
| `06-world-canvas.md` | The game loop, delta time, collision, camera and zoom, drawing the map once, the FPS counter |
| `07-office-model.md` | Employees, departments, the desk rule, hot desks, tiers, floors, rebalancing, admin actions, layouts |
| `08-rooms-and-hearing.md` | Area types, the `canHear` rules table, three worked examples, the highlight and the area chat |
| `09-deployment.md` | Render, Atlas, Metered, every environment variable, cold starts, resetting the demo |
| `10-performance.md` | The 50-bot load test, tick timings, FPS, what the numbers mean, the limits |
| `11-viva-qa.md` | 60+ likely questions with short answers and the file to open |
| `12-redis.md` | Multi-server design (placeholder: **not merged yet**) |
