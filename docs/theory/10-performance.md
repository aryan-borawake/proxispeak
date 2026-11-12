# 10 — Performance: the 50-bot test, tick timings, FPS, limits

*Code: `server/scripts/load-test.js`, `server/scripts/robots.js`, the tick's statistics in `server/signaling/tick.js` (`logTickStats`, `getLastTickStats`), `/api/health` in `server/index.js`, the FPS counter in `client/src/world/WorldCanvas.jsx`. Reports: `docs/load-test.md`, raw output `docs/load-test-runs.txt`, `docs/geo-audit.md`, screenshots 33 and 36 in `docs/screens/`.*

---

## 1. What we promised

From the spec (Week 3) and the project rules:

1. "50 bots walking around and sending positions. Measure how long each check takes."
2. Each "who is near?" database query under 20 ms.
3. The proximity tick (every 250 ms) stays well below 250 ms.
4. Nobody has more than 8 voice connections (`MAX_PEERS`).
5. The office draws at 60 FPS with everyone on screen.

---

## 2. How the load test works

```bash
# terminal 1 (server/), ADMIN_PASSWORD set
npm run dev
# terminal 2 (server/)
node scripts/load-test.js --bots=50 --seconds=30 --spread   # bots all over floor-1
node scripts/load-test.js --bots=50 --seconds=30 --packed   # all 50 within 280 px of the lobby spawn
```

1. **Sign in.** The script signs in as admin, reads the employee list, and signs in each employee (26 people; with 50 bots several bots share a person).
2. **Join.** Each **bot** is a real Socket.io client (the same library as the browser) that sends `player:join { token, floorId: 'floor-1' }`.
3. **Place.** Each bot jumps once to a random free spot (the free first move after joining): anywhere on the floor (spread) or within 280 px of the lobby spawn (packed).
4. **Walk.** Bots walk at 220 px/s and send 10 moves a second, using the same map collision as the browser and staying out of closed neighbourhoods, so the speed check and `WING_CLOSED` never fire.
5. **Measure.** Each bot counts the `players:state` and `peers:update` messages it receives, its peers and any `server:error`. The server logs one line every 5 s:

```
[tick] stats 5s: 20 ticks, avg 26.4 ms, p95 42.4 ms, max 42.4 ms, moved 50.0/tick, online 50, peers/user avg 0.8 max 4
```

6. **Report.** At the end the script prints its counts and the server's last 5 s window from `GET /api/health`.

The terms in the log line:

- **avg**: the average tick duration in the window.
- **p95** (95th percentile): 95 % of ticks were at least this fast. A 5 s window holds about 20 ticks, so in practice p95 is the slowest tick of that window.
- **max**: the slowest tick.
- **moved/tick**: how many players had moved, i.e. how much work each tick had.
- **peers/user**: voice connections per person.

To keep the measurement honest, the per-pair "entered/left" log lines are switched off above 20 people online (`PAIR_LOG_MAX_ONLINE`): printing hundreds of lines a second would itself slow the server down.

---

## 3. Results

Laptop: Windows 11, Node 24, **local** MongoDB at 127.0.0.1. 12 Nov 2026.

| Run | Bots | Moves sent / bot / s | `players:state` / bot / s | Tick avg | Tick p95 | Tick max | Peers / bot (avg · max) | `peers:update` / s (all bots) | Errors |
|---|---|---|---|---|---|---|---|---|---|
| spread, 30 s | 50 | 9.2 | 9.3 | 25–28 ms | 31–46 ms | 46 ms | 0.8 · 4 | 27 | none |
| packed, 30 s | 50 | 9.2 | 9.2 | 35–49 ms | 43–168 ms | 168 ms | 5.8 · **8** | 180 | none |
| packed, 40 s, + the FPS browser on the floor | 50 (+3 people) | 9.3 | 9.3 | 50 ms | 125 ms | 125 ms | 5.4 · **8** | 180 | none |

(Ranges are over the 5 s windows of a run.)

**FPS**: the office page with the F key, headless Chrome, 52 people drawn in the lobby while the packed test ran: **135–140 FPS**, sampled once a second for 8 s (`docs/screens/33-v6-fps-50-bots.png`).

**Database queries alone** (Pratik's spatial audit, local MongoDB on a MacBook, 23 Oct): 50 parallel `$near` queries, 10 rounds: average 9.09 ms, worst 15.87 ms, under the 20 ms target every round (`04-mongodb-geo.md`).

**Small checks**: one wall check (`isWallBetween`) about 0.3 µs; the peer-cap test with 12 robots on one spot gives counts 8 8 8 8 8 8 8 8 8 8 8 6.

---

## 4. What the numbers mean

1. **The tick has plenty of room.** It runs every 250 ms. With all 50 people moving it takes 25–50 ms on average. Even the slowest tick seen (168 ms, packed) finished before the next was due. And because of `tickIsRunning`, a slow tick only delays the next one; ticks never overlap.
2. **Packed is the hard case.** Everyone is within earshot of many others, so each tick has many candidate pairs, the 8-peer cap has to sort and evict, and many `peers:update` messages go out: 180 a second for all 50, about 3.6 per person per second.
3. **The cap works.** Packed: maximum exactly 8, average 5–6 (people at the edge of the crowd have fewer). Spread over a 3520 × 2560 px floor, bots rarely meet (average 0.8).
4. **Broadcasts are on time.** Every bot got `players:state` about 9.3 times a second (target 10). The small gap is the bots' own 100 ms timers drifting on a busy laptop.
5. **No errors**: no `BAD_MOVE`, no `WING_CLOSED`, no `BAD_SIGNAL`.
6. **Where the tick's time goes**: almost all of it is waiting for MongoDB: 1 `bulkWrite` + 1 aggregate + 50 `$near` ≈ 52 database operations per tick. The rule code (`canHear`, the cap) is pure JavaScript and fast.
7. **The browser**: a frame is one `drawImage` of the pre-rendered map plus 52 avatars and name tags. Headless Chrome isn't tied to a 60 Hz screen, so 140 FPS shows **headroom**: a normal browser draws at the screen's 60 FPS, and each frame takes well under its 16.7 ms budget (1000 ms / 60).

What a user feels: a new voice connects within one tick (≤ 250 ms, plus the tick's own 25–50 ms) plus the WebRTC handshake. In a packed crowd, worst case about 0.4 s.

---

## 5. What the test does NOT show

Say these before the examiner does:

1. **No audio.** The bots send positions only. They don't open microphones or WebRTC connections. So the test measures the **server** (tick, broadcasts, signaling decisions), not voice quality or each person's upload.
2. **Local MongoDB, not Atlas.** Network delay to Atlas and the free tier's limit (the team briefing notes about 100 operations a second) are not in these numbers. 52 operations per tick × 4 ticks = about 208 a second at 50 moving people: likely to be throttled on the free tier. See `04-mongodb-geo.md`, section 7.
3. **One server process** on one laptop.
4. **Headless FPS is not what a user sees** (they see 60).
5. **Repeated names**: 26 directory people for 50 bots. The directory itself is never changed by the test.
6. **One unexplained stop**: on the very first load-test attempt the test server stopped silently at 25 joins, with no error printed. It could not be reproduced in six later 30–40 s runs with 50 bots (`docs/build-progress.md`, known issue 10). Worth watching in Render's logs.

---

## 6. The limits of the design

### The mesh and the 8-peer cap

A **mesh** means every pair of people in a conversation has its own direct connection. Each person uploads one copy of their voice per connection:

| Peers per person | Upload per person at 32 kbps each | Connections in total, if a group of (peers + 1) people all hear each other |
|---|---|---|
| 1 | 32 kbps | 1 (2 people) |
| 4 | 128 kbps | 10 (5 people) |
| 8 (the cap) | 256 kbps | 36 (9 people) |
| 30 (no cap) | 960 kbps | 465 (31 people) |

(Total connections for n people = n × (n − 1) / 2. Example: 9 × 8 / 2 = 36.)

So the cap is what keeps a crowd usable on home internet. The price: **a stage talk reaches only 8 listeners**, the 8 most relevant (nearest) audience members. The same holds for any room with more than 9 people; none on the generated map holds more than 12 (the Boardroom).

Beyond 8 needs an **SFU** (Selective Forwarding Unit): a media server that receives each voice once and forwards it to many listeners, so the speaker uploads one copy whatever the audience size. Not built; it would also mean the voice no longer goes purely browser to browser for those rooms.

### Other limits

| Limit | Why | Next step |
|---|---|---|
| One `$near` query per mover per tick | simple, and fine on local MongoDB | one query per floor (fetch the floor's positions once, measure in memory) |
| One server process | players, peer sets, directory and rooms live in memory | Redis (`12-redis.md`) |
| Tick waits 3 database round trips in a row | write → locate → near | keep Render and Atlas in the same region; fewer queries |
| `$facet` sub-pipelines don't use indexes | MongoDB rule | fine at our sizes; per-area indexed `find`s if floors grow to thousands |
| 10 position updates a second | bandwidth | fine; timestamp-based interpolation would hide jitter better |

---

## 7. How to reproduce in the viva

1. `npm run dev` in `server/` (with `ADMIN_PASSWORD` in `.env`).
2. Open the office in a browser, sign in, press **F**.
3. `node scripts/load-test.js --bots=50 --seconds=30 --packed`.
4. Watch the lobby fill with 50 walking bots, the FPS badge, and the server terminal's `[tick] stats 5s: …` lines.
5. Afterwards: `GET /api/health` shows the last window as `tick`.
