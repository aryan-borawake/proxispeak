# Aryan — Daily Log

Module 1: Signaling + WebRTC · Branch `aryan` · Team lead

## Before this log (10–17 Oct)
- 10 Oct: created the repo and my branch.
- 12 Oct: wrote the team briefing: what we're building, how it works, the tech stack, a glossary and the team workflow.
- 15 Oct: first team meeting with module owners; shared the four module briefs and the work distribution.
- 17 Oct: committed the UI prototype (office map, avatar movement, FPS and send counters, earshot circle, interpolation toggle) as a reference for the 2D world module.

## 19 Oct 2026 — Task 1: project skeleton

**What I built**
- Put the project skeleton on `main` in one commit: a folder for each module, the shared files (`AGENTS.md`, `CONTRACTS.md`, `shared/events.js`, `shared/constants.js`), the docs (module briefs, work distribution, git guide, session prompts, log template), GitHub templates, and stub files for every module.
- Created the `dev` branch for integration, and merged `main` into my branch once.
- Updated the team briefing to version 2.

**How it works (in my own words)**
- `CONTRACTS.md` lists every event name, data shape and shared function exactly once. Every module imports names from `shared/`, so a typo breaks loudly instead of silently.
- Every module already has stub functions with the agreed names, so the app runs before anything is built. Each owner replaces their own stubs with real code.
- The server answers `GET /api/health` with `{ ok: true }`, which proves it starts. The client shows "Skeleton running" and links to the three lab pages (`?lab=world`, `?lab=audio`, `?lab=rtc`).

**Problems and how I fixed them**
- Merging `main` into my branch stopped with a conflict in `README.md`, because both branches had changed it. I kept `main`'s version with `git checkout --theirs README.md`, then committed.
- I first created the skeleton's build folder inside the repo by mistake. I moved it outside, so nothing half-finished could end up in a commit.

**What I learned**
- A direct commit on `main` is different from merging a branch into `main`.
- `node_modules` and `dist` are never committed: anyone can rebuild them from `package.json` with `npm install` and `npm run build`.

**Tomorrow**
- Tasks 2 and 3 (catching up): the server's join flow, then receiving and broadcasting positions.
- Explain the pull request rules and the three GitHub buttons we never click, before Wednesday's integration.

## 20 Oct 2026 — Task 2: join flow

**What I built**
- `server/signaling/players.js`: an in-memory list of players (a JavaScript `Map` from socket id to `{ id, name, x, y, dir }`) with add, remove, get and list helpers.
- The join flow in `server/signaling/index.js`: on `player:join` the server checks the name, rejects a second join from the same browser, places the player at the spawn point (200, 200) facing down, adds them to the `office-1` room, replies with `world:init`, and tells everyone else with `player:joined`. On disconnect, the player is removed.
- `server/scripts/join-test.js`: connects two fake players plus one with no name, and prints what each receives.

**How it works (in my own words)**
- Positions change up to 10 times a second, so they live in server memory, not the database.
- The list of existing players is taken before the newcomer is added, so nobody sees themselves in their own `world:init`.

**Decision**
- `CONTRACTS.md` gives the error shape `{ code, message }` but no list of codes, so `BAD_NAME` and `ALREADY_JOINED` are local for now. They move into `shared/` with Task 3.

**Tomorrow**
- Task 3: receive positions, broadcast them every 100 ms, and tell others when someone leaves.

## 21 Oct 2026 — Task 3: positions in, positions out

**What I built**
- Moved the error codes into `shared/constants.js` as `ERROR_CODES` and added two new ones: `NOT_JOINED` (sent a move before joining) and `BAD_MOVE` (bad x, y or direction). CONTRACTS.md is now v2.
- `player:move` is now validated: x and y must be real numbers from 0 to 4096, and the direction must be up, down, left or right. A bad move gets a `server:error` with `BAD_MOVE` and changes nothing.
- A good move overwrites that player's x, y and dir in the in-memory Map, and sets a `moved` flag for the proximity tick I'll build in Task 6.
- Every 100 ms the server sends one `players:state` message to the whole room with everyone's latest `{ id, x, y, dir }` and a timestamp `t`.
- When a tab closes, the server removes the player and sends `player:left` with their id.
- Wrote `server/scripts/move-test.js` (11 checks). All pass, and `join-test.js` still passes.

**How it works**
- The server doesn't forward each move. Each move just replaces the player's old position, and a timer sends the whole list every 100 ms. So 10 people moving 10 times a second cause 10 messages a second to each browser, not 900 in total.
- Validating means checking data before using it, because a browser can send anything, like `x: '10'` or `y: 5000`.

**Problems and what I learned**
- Claude Code found that `world:init` would have leaked the internal `moved` flag to browsers. It now copies only `{ id, name, x, y, dir }`.
- The old disconnect code removed the player but never sent `player:left`. Fixed.
- JSON has no NaN, so Socket.io turns a NaN into `null`. The check still rejects it, because null isn't a number.
- The tests expect the server to already be running (`npm run dev`).

**To do in Task 6**
- Also set `moved` when a player joins, and clear it after each tick. Otherwise someone who joins and stands still is never saved.

## 22 Oct 2026 — Task 4: browser connection (net)
- Built client/src/net/index.js: one Socket.io connection shared by the whole page, with connect, sendMove, sendSignal and five on… listeners that each return an unsubscribe function.
- connect() listens for world:init, server:error and connect_error before connecting, gives up after 5 s, and shares one promise so two quick clicks join only once.
- The ?lab=rtc page joins with a name, lists everyone online, and moves me 10 px right; the other tab sees it within 100 ms.
- Learned: the socket starts switched off (autoConnect false) so other modules can listen before anyone joins.
- Notes for later: world:init has no direction for me (assumed 'down'); no auto-rejoin after a server restart (Task 11); VITE_SERVER_URL needs sorting before deploy.

## 23 Oct 2026 — Task 6: proximity tick with fake nearby
- Every 250 ms the server finds players who moved, asks fakeNearby.js who is within 140 px, and uses computePeerChanges (connect at 100 px, disconnect beyond 140 px) to decide who entered and who left.
- Peer sets are symmetric: if A hears B, B hears A. Each affected browser gets one peers:update per tick.
- A player who joins now counts as moved, so someone who joins and stands still still gets matched (the fix noted in Task 3).
- On disconnect, former peers get a left message.
- Learned: the 100/140 gap stops flicker. At 130 px a connected pair stays connected, but an unconnected pair does not connect.

## 24 Oct 2026 — Task 5: signaling docs v1
- Wrote docs/signaling.md: join, move, broadcast, leave, the browser net connection and (if built) the proximity tick, all in my own words from the code.
- Checked the doc against the code. Where the code and CONTRACTS.md differ, I noted it.
- Learned: explaining the 100 ms broadcast and the 100/140 px gap out loud is the best viva practice.