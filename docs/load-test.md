# Load test — 50 people on one floor

Spec, Week 3: *"Write a load test: 50 bots walking around and sending positions. Measure how long each
check takes."* Targets: the proximity tick (every 250 ms) stays far below 250 ms, nobody gets more than
`MAX_PEERS` (8) voice connections, and the office still draws at 60 FPS with everyone on screen.

## How to run it

```bash
# terminal 1 (server/)       ADMIN_PASSWORD must be set (the script reads the employee list)
npm run dev
# terminal 2 (server/)
node scripts/load-test.js --bots=50 --seconds=30 --spread    # bots all over floor-1
node scripts/load-test.js --bots=50 --seconds=30 --packed    # all 50 within 280 px of the lobby spawn
```

- **Bots** are real Socket.io clients. They sign in as the demo directory's employees (the directory is
  only read; with 26 people, several bots share a name), join `floor-1`, jump once to a random free spot
  (the one free move after joining), then **walk** at `WALK_SPEED_PX_PER_SEC` (220 px/s), sending
  `MOVE_SEND_HZ` (10) moves a second. They use the same map collision as the browser and keep out of
  closed neighbourhoods, so the server's speed check and `WING_CLOSED` never trigger.
- **The server** logs one line every `TICK_STATS_LOG_MS` (5 s):
  `[tick] stats 5s: 20 ticks, avg 26.4 ms, p95 42.4 ms, max 42.4 ms, moved 50.0/tick, online 50, peers/user avg 0.8 max 4`
  and `GET /api/health` returns the same numbers as `tick` (the load test prints them at the end).
- **What one tick does** with 50 movers (v6): one `bulkWrite` of 50 positions, one `$facet` aggregate of
  `$geoWithin` over the 66 areas (who is in which room), 50 `findNearby` (`$near`) queries in parallel,
  then the room rules (`canHear`) and the MAX_PEERS cap for each mover, then the `peers:update` messages.

Raw output of the runs below: [`docs/load-test-runs.txt`](load-test-runs.txt). Screenshot of it:
`docs/screens/36-v6-load-test-output.png`.

## Results (laptop: Windows 11, Node 24, local MongoDB 127.0.0.1)

| Run | Bots | Moves sent / bot / s | `players:state` / bot / s | Tick avg | Tick p95 | Tick max | Peers / bot (avg · max) | `peers:update` / s (all) | Errors |
|---|---|---|---|---|---|---|---|---|---|
| spread, 30 s | 50 | 9.2 | 9.3 | 25–28 ms | 31–46 ms | 46 ms | 0.8 · 4 | 27 | none |
| packed, 30 s | 50 | 9.2 | 9.2 | 35–49 ms | 43–168 ms | 168 ms | 5.8 · **8** | 180 | none |
| packed, 40 s, + the FPS browser on the floor | 50 (+3 people) | 9.3 | 9.3 | 50 ms | 125 ms | 125 ms | 5.4 · **8** | 180 | none |

(Tick columns: the range over the 5-second windows of the run. A window holds about 20 ticks, so its
"p95" is in practice the slowest tick of that window.)

**FPS** (office page, `F` key, headless Chrome, 52 people drawn in the lobby while the packed load test
ran): **135–140 FPS** sampled once a second for 8 s (`docs/screens/33-v6-fps-50-bots.png`). Headless
Chrome is not tied to a 60 Hz screen, so this shows the headroom: a normal browser draws at the
display's rate (60 FPS), with the frame taking well under its 16.7 ms budget.

## What the numbers mean

- **The tick has plenty of room.** It runs every 250 ms; with 50 people all moving at once it takes
  25–50 ms on average, and even the slowest tick we saw (168 ms, packed) finished before the next one was
  due. The tick never overlaps itself (`tickIsRunning`), so a slow tick delays, it doesn't pile up.
- **Packed is the hard case**, as expected: everyone is within earshot of many others, so every tick has
  many candidate pairs, the MAX_PEERS cap has to choose (sort, evict the least relevant link), and many
  `peers:update` messages go out (180 a second for all 50, about 3.6 per person per second).
- **MAX_PEERS works**: in the packed run the maximum is exactly 8 and the average 5–6 (some bots are at
  the edge of the crowd). Spread out on a 3520 × 2560 px floor, bots rarely meet (average 0.8).
- **Broadcasts are on time**: every bot received `players:state` about 9.3 times a second (target 10;
  the small gap is the bots' own 100 ms timer drifting on a busy laptop).
- **No server errors**: no `BAD_MOVE` (speed check), no `WING_CLOSED`, no `BAD_SIGNAL`.
- **Where the time goes**: almost all of it is waiting for MongoDB (51 queries per tick). The cheapest
  next step, if we ever needed it, would be one `$near` per room instead of one per mover — but at 50
  people per floor it isn't needed.
- **The browser**: drawing is one `drawImage` of the pre-rendered map plus 52 avatars and name tags;
  the per-frame wall check (`isWallBetween`) costs 0.36 µs per nearby person.

## Limits we know about

- A mesh: each person uploads one copy of their voice per connection (8 × 32 kbps = 256 kbps at the
  cap, `AUDIO_MAX_BITRATE_BPS`). A stage talk to more than 8 listeners would need a media server (SFU);
  with the cap, the 8 most relevant listeners (nearest) hear the speaker.
- One server process. Two copies sharing users through Redis (the spec's Week 3 Redis item) is not done.
