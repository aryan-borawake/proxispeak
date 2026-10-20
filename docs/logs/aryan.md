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