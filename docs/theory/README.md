# ProxiSpeak theory docs

These pages explain how ProxiSpeak works and why, so the team lead can explain and defend every part in a technical viva, from a 2-minute overview down to the code. Every claim was checked against the code on branch `aryan` (CONTRACTS.md v6, 12 Nov 2026). Where something is planned but not built, the page says so.

## The 10-minute version

Read these two, in this order:

1. [`00-overview.md`](00-overview.md): the problem, one end-to-end story, the architecture, the stack, the three speeds.
2. [`11-viva-qa.md`](11-viva-qa.md): 85 likely questions with short answers and the file to open for each.

## The deep version

All of them, in this order:

| # | Doc | Covers |
|---|---|---|
| 00 | [`00-overview.md`](00-overview.md) | The big picture |
| 01 | [`01-auth-and-sso.md`](01-auth-and-sso.md) | Directory sign-in, the HMAC-signed token, admin password, single sign-on (design) |
| 02 | [`02-signaling-and-tick.md`](02-signaling-and-tick.md) | Join, move, broadcast, the 250 ms tick, peer sets, 100/140 px, the 8-peer cap, floors, re-join |
| 03 | [`03-webrtc-stun-turn.md`](03-webrtc-stun-turn.md) | Offer, answer, ICE, who offers, the candidate queue, STUN vs TURN, Metered, `VITE_` values, 32 kbps |
| 04 | [`04-mongodb-geo.md`](04-mongodb-geo.md) | The positions collection, the 2d index, `$near`, `$geoWithin`, explain output, the < 20 ms audit, Atlas limits, all collections |
| 05 | [`05-audio.md`](05-audio.md) | Volume and pan formulas, the Web Audio chain, full mode, wall muffling, smoothing, the Chrome trick |
| 06 | [`06-world-canvas.md`](06-world-canvas.md) | The game loop, delta time, collision, camera and zoom, drawing the map once, the FPS counter |
| 07 | [`07-office-model.md`](07-office-model.md) | Employees, departments, the desk rule, hot desks, tiers, floors, rebalancing, admin, the generated map, layouts |
| 08 | [`08-rooms-and-hearing.md`](08-rooms-and-hearing.md) | Area types, the `canHear` rules, three worked examples, the highlight, area chat |
| 09 | [`09-deployment.md`](09-deployment.md) | Render, Atlas, Metered, every environment variable, region, cold starts, resetting the demo |
| 10 | [`10-performance.md`](10-performance.md) | The 50-bot load test, tick timings, FPS, what they mean, limits |
| 11 | [`11-viva-qa.md`](11-viva-qa.md) | The question bank |
| 12 | [`12-redis.md`](12-redis.md) | Several server copies with Redis: **placeholder, not merged yet** |

## Other references

- `CONTRACTS.md`: the exact events, payloads, functions and database shapes.
- `docs/build-progress.md`: what was built in v5 and v6, test output, known issues.
- `docs/load-test.md`, `docs/geo-audit.md`, `docs/deploy.md`: the measurements and the deploy guide.
- `docs/screens/`: screenshots 01–36.
