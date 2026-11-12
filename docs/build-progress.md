# Infotact product build — progress log

Branch `aryan`. Built overnight, stage by stage. Each entry: what is done, what is left, decisions.

## Baseline (before any change)

- Server started with local MongoDB: `nearby engine: geo (Person 2, MongoDB)`.
- Robot tests: join ✔, move ✔ (all checks passed), tick ✔, signal ✔, reconnect ✔.

## Stage 1 — landing page (#/) — DONE

- New product shell: `client/src/app/` (hash router, theme CSS, own SVG logo mark, line icons).
  `App.jsx` keeps every `?lab=` page; with no `?lab`, the product shows (landing first).
- Landing: top bar (logo + "Sign in"), hero with "Enter the Infotact office" (→ `#/signin`), a framed
  preview of our own map (`client/public/office-preview.png`), 4 feature cards, footer
  "Built for Infotact · Group 40".
- Done early because the preview needs it: the HQ floor map. `server/scripts/build-office-map.js`
  keeps the original 35 × 25 office (now saved as `office-base.json`) in the top-left and adds an east
  corridor, an elevator and four 25-desk wings in the same tileset → `office.json` (85 × 53 tiles) and
  `server/office/layout.json` (100 desks, 14 hot desks = the original desk room's chairs, rooms, wings).
- Decision: extend `office.json` (as asked) rather than a second map file; every old coordinate
  (DEFAULT_SPAWN, WorldLab bot spots) is unchanged because the original stays at (0, 0).
- Checks: client build ✔; landing screenshot ✔. Server untouched so far (shared files: additions only).
- Left: everything else.

## Stage 2 — directory, sign-in, lobby — DONE

- `server/office/`: Mongoose models (departments, employees, floors, alerts), `seedData.js` (16 demo
  people in Engineering, Design, Marketing, HR, Management + `admin@infotact.demo`), `seed.js` /
  `seedDb.js` (idempotent upserts with `$setOnInsert`, matched by `_id` / email), `store.js` (the
  directory in memory, saved to MongoDB after every change; demo directory in memory when there is
  no database), `layout.js`, plus the pure rules `desks.js` and `tiers.js` (needed to seat the seed).
- `server/auth/`: HMAC-SHA256 tokens with Node `crypto` (`token.js`, 12 h), secrets read from env only
  (`secrets.js`: `AUTH_SECRET`, `ADMIN_PASSWORD`), middleware (`requireEmployee`, `requireAdmin`),
  routes `POST /api/auth/employee`, `POST /api/auth/admin`, `GET /api/auth/demo` (chips), `GET /api/me`.
- Signaling: `player:join { token }` → directory name, role, department, floor, desk; the player joins
  the room of their floor. `{ name }` joins still go to `DEFAULT_ROOM` (labs, tests). Broadcasts,
  leave messages and the tick are now per room; one geo engine per room (`createGeoEngine({ roomId })`).
- Client: `net.connect({ token, avatarColor })`, re-join sends the token + current floor + status.
  `SignInPage` (Employee / Admin tabs, demo chips, SSO note), `LobbyPage` (profile, 6 colours, mic test
  with `createMicMeter`, Join office), `session.js` (token in sessionStorage with try/catch).
- Decisions: the store keeps the directory in memory (no DB query per join/move); if `AUTH_SECRET` is
  missing the server makes a random one per run and warns; if `ADMIN_PASSWORD` is missing admin
  sign-in is refused with a clear message. Seed sizes add up to 25 so the demo starts at tier 1.
- Checks: join/move/tick/signal/reconnect ✔; new `auth-test.js` 9/9 ✔; `seed.js` twice → 0 inserted
  the second time, 17 employees total ✔; client build ✔; screenshots 01–05 ✔.

## Stage 3 — office interface (#/office) — DONE

- `client/src/app/OfficePage.jsx` + `OfficeParts.jsx`: full-screen map on sky blue; top bar
  "Infotact HQ · Floor 1 · <room or department>"; bottom bar (me + status menu, Mute, My desk Ctrl+D,
  Floors, People, Leave; no camera button); collapsible People panel (Nearby with a speaker icon when
  the mixer is playing that person, Online on this floor); zoom +/−, wheel zoom, locate me; welcome
  card; toasts; Escape closes menus.
- Voice wiring moved into `client/src/app/useVoiceSession.js` and used by BOTH the office and
  `OfficeLab.jsx` (no duplicated net → rtc → mixer logic). `?lab=office` still works the same way.
- World (`client/src/world/`, commented, all new props optional so WorldLab is unchanged in use):
  camera follows smoothly, zoom 0.5×–3× with `imageSmoothingEnabled = false` and whole-pixel shifts,
  the map pre-rendered once (`renderMapToCanvas`) so a frame is one drawImage; `officeOverlay.js`
  draws department borders (union outline of the block), closed wings, room labels, elevator, desk
  pulse, avatars in the chosen colour, name tags with a status dot. `checkCollision` checks every
  collision/walls layer; closed wings are also not walkable in the browser.
- `player:status { status }` (STATUSES) → `{ id, status }` to the room. DND implemented on the server:
  turning it on hangs up all peers, and the tick leaves DND players out of every peer set.
- Checks: robot tests ✔ (re-run below), client build ✔, screenshots 06–12 ✔ (two real headless tabs
  connected over WebRTC: "Nearby" shows Arjun with the speaker icon).
- Known: neighbouring desks are 128 px apart (the original map's desk spacing) and earshot is 100 px,
  so two people sitting at neighbouring desks do not hear each other until one leans over (walks a
  step). Changing it means tighter desk rows in the generator or a bigger EARSHOT_PX (team decision).

## Stage 4 — desks grouped by department + Ctrl+D — DONE

- `server/office/layout.json` (made by `server/scripts/build-office-map.js`): one floor plan, wings A–D
  × 25 desks (snake-numbered so desk n and n + 1 are neighbours), 14 hot desks (the original office's
  own desk room, next to the lobby), lobby spawn, meeting room, town hall, focus room, lounge,
  elevator. Desk tiles are copied from the original map's desk + chair tiles; every desk spot is walkable.
- `server/office/desks.js` (pure): own block → grow into the neighbouring desk (same wing) → a free
  desk elsewhere on the floor (it joins the department's block; may open the next wing) → hot desk
  (+ admin alert "Floor N is full …") → FLOOR_FULL. `reserveBlock` (new departments: one unbroken run
  in one wing if possible) and `resizeBlock` (grow next to itself, shrink without evicting anyone).
- Map: each department's block gets a coloured outline + pale fill + name label (`officeOverlay.js`).
- Ctrl+D / "My desk": `net.sendMove` jump (no path-finding), camera snaps, the desk pulses for 6 s; if
  the desk is on another floor, it takes the elevator first.
- Checks: new `server/scripts/office-rules-test.js` 27/27 ✔ (layout, tiers, blocks, desk rule incl. hot
  desks and FLOOR_FULL, resize, rebalance); screenshot 10 (Ctrl+D at desk A-01, borders) ✔.

## Stage 5 — admin page (#/admin) — DONE

- `AdminPage.jsx` (sidebar: Overview, Departments, Employees, Floors, Alerts, Enter office, Sign out;
  reloads every 5 s for "online") + `AdminSections.jsx`.
- Overview: headcount (+ online), desks used / capacity (desks in open wings), tier per floor, hot desks
  used, open alerts, and a mini-map per floor (our map preview + department blocks in their colours,
  closed wings darkened with "Opens at tier N", hot desks in use in red).
- Departments: table (name, colour, floor, wing, size + reserved, people); add; rename / recolour /
  resize in the row (resize = `PATCH`, the desk rule runs for that department only).
- Employees: table (name, email, role, department, floor, desk or "hot desk", online); "Add employee"
  form; "Add 10 sample employees" into a chosen department. Note box with the HR-system sentence.
- Server: every `/api/admin/*` route is behind `requireAdmin` (admin-flag token + role admin).
- Checks: auth-test 9/9 (employee token → 403 on /api/admin) ✔; client build ✔; screenshots 13–15 ✔.
- Also added `server/office/reset-demo.js --yes` (wipe + re-seed the demo directory; restart after).

## Stage 6 — scaling: tiers, floors, hot desks, rebalancing — DONE

- Tiers (`server/office/tiers.js`): 25 → A, 50 → A + B, 75 → A–C, 100 → all four. A floor's tier is the
  smallest that fits its headcount AND every wing holding a used or reserved desk; it only grows.
  Closed wings: drawn darkened with "Opens at tier N", blocked by the browser's collision check, and
  refused by the server (`WING_CLOSED`). When a wing opens, the floor gets `office:update` and redraws.
- Floors: every floor is its own room (`roomId` = floor id) for joins, broadcasts, the tick and one geo
  engine each. You join the floor of your desk; the elevator (stand on it, press E) or the Floors
  button sends `floor:change`; the server answers `floor:changed` (a new world, same socket id) and
  the page rebuilds the rtc manager and remounts the world. `DEFAULT_ROOM` stays for labs and tests.
- Overflow: past the last free desk, hires get hot desks and ONE open alert per floor, updated with the
  count ("Floor 1 is full: 10 people are on hot desks …"). Admin → Floors → "Add Floor 2" → dialog
  (floor picker per department) → Apply: `planRebalance` (pure) gives the moved departments new blocks
  on the new floor, frees their old desks, seats the remaining hot-deskers; online members are moved
  to the new floor at once; the "full" alert resolves itself when no hot-deskers remain.
- Decision: "a free block elsewhere" = the next free unreserved desk anywhere on the floor (wings in
  opening order); it becomes part of the department's block, so a department can own patches in
  several wings (visible on the mini-map). Reserved-but-empty desks of OTHER departments are never
  taken, so a floor can go to hot desks at 97/100 desks used (shown honestly on the overview).
- Checks: `office-rules-test.js` 27/27 ✔ (tiers, desk rule incl. hot desks, rebalance), new robot test
  `floor-test.js` 16/16 ✔ (different floors at the same x, y: no players:state, no player:joined, no
  peers:update; elevator; DND; WING_CLOSED; BAD_FLOOR; office:update), screenshots 16–22 ✔.

---

# FINAL REPORT (morning summary)

## Stages

| Stage | Status |
|---|---|
| 1 Landing page `#/` | ✅ done |
| 2 Directory, sign-in, lobby | ✅ done |
| 3 Office interface `#/office` | ✅ done (DND included) |
| 4 Desks by department + Ctrl+D | ✅ done |
| 5 Admin page `#/admin` | ✅ done |
| 6 Scaling: tiers, floors, hot desks, rebalancing | ✅ done |

Nothing was committed (no git write commands). No npm packages were added. Your `.env` was not read or changed.

## Files changed (one line each)

Shared / root
- `shared/constants.js` — v5 constants (STATUSES, ROLES, WING_IDS, DESKS_PER_WING, FLOOR_CAPACITY, DEFAULT_FLOOR_ID, TOKEN_TTL_MS, AVATAR_COLORS, ALERT_TYPES) + 4 error codes.
- `shared/events.js` — PLAYER_STATUS, OFFICE_UPDATE, FLOOR_CHANGE, FLOOR_CHANGED; JOIN / WORLD_INIT comments.
- `CONTRACTS.md` — v5 (sections 3, 4, 4b, 5 rule 6, 6, 7, 9, 9b, 10, 12 change log, 13).
- `.env.example` — AUTH_SECRET and ADMIN_PASSWORD (empty).
- `render.yaml` — AUTH_SECRET and ADMIN_PASSWORD on the server service, `sync: false`.

Server
- `server/index.js` — mounts the auth and office routes, loads the office store, passes createGeoEngine.
- `server/signaling/index.js` — token joins, rooms per floor, status, floor change, closed-wing check, per-room broadcast.
- `server/signaling/officeRooms.js` (new) — token-join reading, world init, floor moves, office-change watcher.
- `server/signaling/tick.js` — one geo engine per room, same-room + DND filter, `disconnectAllPeers`.
- `server/signaling/players.js` — keeps the v5 player fields; `listPlayersInRoom`.
- `server/signaling/fakeNearby.js` — same room only.
- `server/auth/token.js` (new) — HMAC-SHA256 tokens with Node crypto.
- `server/auth/secrets.js` (new) — AUTH_SECRET / ADMIN_PASSWORD from the environment only.
- `server/auth/middleware.js` (new) — requireEmployee, requireAdmin, authenticate.
- `server/auth/routes.js` (new) — /api/auth/employee, /api/auth/admin, /api/auth/demo, /api/me.
- `server/office/models.js` (new) — departments, employees, floors, alerts.
- `server/office/store.js` (new) — directory in memory + MongoDB write-through; admin actions, alerts, tiers.
- `server/office/desks.js` (new) — pure desk rule, reserveBlock, resizeBlock.
- `server/office/tiers.js` (new) — pure tier functions.
- `server/office/rebalance.js` (new) — pure planRebalance.
- `server/office/layout.js`, `layout.json` (new) — the floor plan (generated).
- `server/office/seedData.js`, `seedDb.js`, `seed.js` (new) — idempotent demo directory seed.
- `server/office/reset-demo.js` (new) — wipe + re-seed (needs `--yes`).
- `server/office/routes.js` (new) — /api/office/* and /api/admin/*.
- `server/scripts/build-office-map.js` (new) — generates office.json + layout.json from office-base.json.
- `server/scripts/auth-test.js`, `floor-test.js`, `office-rules-test.js` (new) — tests.
- `server/scripts/cdp.js`, `screens-walkthrough.js`, `capture-map-preview.js` (new) — headless Chrome tools (Node built-ins only).

Client
- `client/src/App.jsx` — labs on `?lab=`, the product otherwise.
- `client/src/OfficeLab.jsx` — uses the shared `useVoiceSession` (same behaviour).
- `client/src/net/index.js` — token join, sendStatus, onPlayerStatus, onOfficeUpdate, changeFloor, onFloorChanged, leave, SERVER_URL export.
- `client/src/app/` (new) — ProductApp, router, session, Logo, icons, people, app.css, LandingPage, SignInPage, LobbyPage, OfficePage, OfficeParts, AdminPage, AdminSections, useVoiceSession.
- `client/src/world/WorldCanvas.jsx` — camera follow, zoom, fill mode, controller, office overlay, name tags (all new props optional).
- `client/src/world/map.js` — renderMapToCanvas; collision checks every collision/walls layer.
- `client/src/world/officeOverlay.js` (new) — borders, closed wings, labels, elevator, pulse, avatars, name tags.
- `client/src/world/README.md` — note for Anjali about office-base.json and the generator.
- `client/public/maps/office.json` — the HQ floor (generated); `office-base.json` (new) — the untouched original.
- `client/public/office-preview.png` (new) — landing preview, a picture of our own map.

Docs
- `docs/build-progress.md` (this file), `docs/screens/*.png` (24 screenshots).

## Test and build output

All against local MongoDB (`engine: geo`), on a freshly reset demo directory:

```
=== node scripts/join-test.js
[join-test] NoName received server:error: {"code":"BAD_NAME","message":"Join needs a name: send { name: \"Riya\" } with a non-empty string."}
[join-test] done: all expected events arrived
exit code: 0
=== node scripts/move-test.js
[move-test] PASS  1. move before join gives NOT_JOINED
[move-test] PASS  2. B sees A at (250, 300, right) with a numeric t
[move-test] PASS  3. bad move (x is the text "10") gives BAD_MOVE and A stays put
[move-test] PASS  3. bad move (x is NaN) gives BAD_MOVE and A stays put
[move-test] PASS  3. bad move (x is -1) gives BAD_MOVE and A stays put
[move-test] PASS  3. bad move (y is 5000 (above 4096)) gives BAD_MOVE and A stays put
[move-test] PASS  3. bad move (dir is "sideways") gives BAD_MOVE and A stays put
[move-test] PASS  3. bad move (payload is null) gives BAD_MOVE and A stays put
[move-test] PASS  4. B got 9 players:state in 1000 ms (want 8 to 12)
[move-test] PASS  5a. B gets player:left with A's id
[move-test] PASS  5b. A is gone from the next players:state
[move-test] all checks passed
exit code: 0
=== node scripts/tick-test.js
[tick-test] EARSHOT_PX 100, DISCONNECT_PX 140, B stays at (200, 200)
[tick-test] PASS  1a. join at 0 px: A gets entered [B] once, mode falloff
[tick-test] PASS  1b. join at 0 px: B gets entered [A] once, mode falloff
[tick-test] PASS  1c. peers:update has the contract shape { entered, left, changed: [] }
[tick-test] PASS  2a. A at 200 px: A gets left [B]
[tick-test] PASS  2b. A at 200 px: B gets left [A]
[tick-test] PASS  3a. A at 130 px, not connected: A gets no entered
[tick-test] PASS  3b. A at 130 px, not connected: B gets no entered
[tick-test] PASS  4a. A at 90 px: A gets entered [B]
[tick-test] PASS  4b. A at 90 px: B gets entered [A]
[tick-test] PASS  5a. A at 130 px, connected: A gets no left
[tick-test] PASS  5b. A at 130 px, connected: B gets no left
[tick-test] PASS  6a. A at 200 px: A gets left [B]
[tick-test] PASS  6b. A at 200 px: B gets left [A]
[tick-test] PASS  7a. A back at 90 px: A gets entered [B]
[tick-test] PASS  7b. B disconnects: A gets left [B]
[tick-test] PASS  7c. that peers:update is exactly { entered: [], left: [B], changed: [] }
[tick-test] PASS  8a. C far away: A gets no entered for C
[tick-test] PASS  8b. C far away: C gets no peers:update at all
[tick-test] all checks passed
exit code: 0
=== node scripts/signal-test.js
[signal-test] A = Yc6HG9i9XxZVhjUrAAAI, B = hFFxlH05VbgOTAVeAAAJ (same spot, so they should be peers now)
[signal-test] PASS  1. A → B offer: B gets { from: A, data } with identical data
[signal-test] PASS  2. forged from: 'hacker' is ignored: B sees A's real id
[signal-test] PASS  3a. B → A answer is delivered with from = B
[signal-test] PASS  3b. B → A candidate is delivered with from = B
[signal-test] PASS  4. signal to an unknown id → BAD_SIGNAL
[signal-test]        server said: Signal not delivered: no player with id "nobody-has-this-id" is online.
[signal-test] PASS  5a. A → C while C is far away → BAD_SIGNAL (not in earshot)
[signal-test]        server said: Signal not delivered: player "3Wfh3BUgVznsCLKlAAAK" is not within earshot of you. Only send signals to people you got in peers:update "entered".
[signal-test] PASS  5b. C received no signal
[signal-test] PASS  6a. missing `to` → BAD_SIGNAL
[signal-test]        server said: Signal ignored: `to` must be a player id (text). Send { to, data } where data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
[signal-test] PASS  6b. data.type 'nonsense' → BAD_SIGNAL
[signal-test]        server said: Signal ignored: `data.type` must be one of offer, answer, candidate. Send { to, data } where data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
[signal-test] PASS  6c. null payload → BAD_SIGNAL
[signal-test]        server said: Signal ignored: the payload must be an object. Send { to, data } where data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
[signal-test] PASS  7. signal before joining → NOT_JOINED
[signal-test]        server said: Join first: send EVENTS.JOIN with { name } before sending signals.
[signal-test] all checks passed
exit code: 0
=== node scripts/reconnect-test.js
[reconnect-test] A = PZ-AMDN5BzSiyh8OAAAN, B = A472pE9JN05JocsaAAAM (same spot, so they should be peers now)
[reconnect-test] cutting A's connection (network blip)...
[reconnect-test] A reconnected as fviZE75vz4aoAlPhAAAO; sending player:join again
[reconnect-test] A re-joined as fviZE75vz4aoAlPhAAAO
[reconnect-test] PASS  1. A gets a new world:init with a new selfId
[reconnect-test] PASS  2. B gets player:left for A's old id
[reconnect-test] PASS  3. B gets player:joined for A's new id
[reconnect-test] PASS  4. B's peers:update lists A's old id in left
[reconnect-test] PASS  5. B's peers:update lists A's new id in entered
[reconnect-test] A closes the tab...
[reconnect-test] PASS  6. tab closed: B gets player:left and peers:update left for A
[reconnect-test] A refreshes the page (a new connection joins)...
[reconnect-test] PASS  7. refreshed tab joins as a new player: B gets player:joined and peers:update entered
[reconnect-test] all checks passed
exit code: 0
=== node scripts/auth-test.js
[auth-test] PASS  1. unknown email → 404 "Not in the Infotact directory"
[auth-test] PASS  2a. directory email → 200 with token and profile
[auth-test] PASS  2b. GET /api/me with the employee token → 200, same person
[auth-test] PASS  3. join with the token → world:init with the directory name, the floor room and a profile
[auth-test] PASS  4. join with a forged token → BAD_TOKEN
[auth-test] PASS  5. admin email + wrong password → 401
[auth-test] PASS  6a. employee token on /api/admin/overview → 403
[auth-test] PASS  6b. no token on /api/admin/overview → 401
[auth-test] PASS  7. admin email + ADMIN_PASSWORD → admin token → overview 200
[auth-test] all checks passed
exit code: 0
=== node scripts/floor-test.js
[floor-test] added Floor 2 for this test
[floor-test] PASS  1a. Arjun joined floor-2 (his world:init roomId)
[floor-test] PASS  1b. Arjun's world:init does not list Riya
[floor-test] PASS  1c. Riya's players:state never shows Arjun
[floor-test] PASS  1d. Arjun's players:state never shows Riya
[floor-test] PASS  1e. no player:joined across floors
[floor-test] PASS  1f. no peers:update for each other at 0 px apart
[floor-test] PASS  2a. Arjun gets floor:changed for floor-1 (same socket id)
[floor-test] PASS  2b. Riya gets player:joined for Arjun
[floor-test] PASS  2c. both get peers:update entered for each other
[floor-test] PASS  3a. DND: both get left for each other
[floor-test] PASS  3b. DND: Riya gets player:status { id: Arjun, status: dnd }
[floor-test] PASS  3c. DND: Riya moving next to him does not reconnect
[floor-test] PASS  4. available again: both get entered
[floor-test] PASS  5. a move into closed wing B → WING_CLOSED
[floor-test] PASS  7. an admin change → office:update for floor-1 with tier, open wings and departments
[floor-test] PASS  6. a name join asking for a floor change → BAD_FLOOR
[floor-test] all checks passed
exit code: 0
=== node scripts/office-rules-test.js
[rules-test] PASS  0a. layout has 4 wings × 25 desks and 14 hot desks
[rules-test] PASS  0b. snake numbering: desk n and n + 1 are always next to each other
[rules-test] PASS  1a. tierForHeadcount: 0 → 1, 25 → 1, 26 → 2, 50 → 2, 75 → 3, 100 → 4, 130 → 4
[rules-test] PASS  1b. openWingsForTier(2) → A, B
[rules-test] PASS  1c. tier only grows: previous 3, headcount 10 → 3
[rules-test] PASS  1d. a used desk in wing C opens tier 3 even with 17 people
[rules-test] PASS  2a. an 8-desk block on an empty floor = A-01 … A-08
[rules-test] PASS  2b. 20 desks of A reserved, size 8 does not fit in A → B-01 … B-08 (one unbroken run)
[rules-test] PASS  3a. first 3 hires → own block (A-01, A-02, A-03)
[rules-test] PASS  3b. 4th hire: block full → grow into the free neighbour A-04
[rules-test] PASS  3c. … and A-04 is now part of the block
[rules-test] PASS  3d. 5th hire: both neighbours taken → a free desk elsewhere (A-07, after HR)
[rules-test] PASS  4a. 101st person → hot desk H-01, hotDesk: true
[rules-test] PASS  4b. after all 14 hot desks → FLOOR_FULL with no desk
[rules-test] PASS  5a. demo directory: 17 people, all at desks in wing A inside their own block
[rules-test] PASS  5b. demo department blocks add up to 25 desks (tier 1)
[rules-test] PASS  6a. shrink 5 → 2 keeps the two occupied desks (A-01, A-04)
[rules-test] PASS  6b. grow 5 → 7 takes the neighbours A-06, A-07 (A-08 is HR)
[rules-test] PASS  6c. grow 5 → 8: no free neighbour after A-07 → a desk elsewhere (A-10)
[rules-test] PASS  6d. resizing only changes that department (HR untouched)
[rules-test] PASS  7a. all 60 engineers moved to floor-2
[rules-test] PASS  7b. on floor-2 they sit in their new block, no hot desks
[rules-test] PASS  7c. floor-2 block starts at A-01 (an empty floor)
[rules-test] PASS  7d. the 3 Marketing hot-deskers on floor-1 got real desks
[rules-test] PASS  7e. nobody on floor-1 shares a desk
[rules-test] PASS  7f. the input was not changed (pure function)
[rules-test] PASS  7g. the first hot-desker joins Marketing's block next to it
[rules-test] all checks passed
exit code: 0
```

(The "exit code" lines above come from the output filter, not the tests. Each script prints "all checks passed" / "done" only when every check passed, and exits with code 1 on any FAIL.)

Same tests against a server with NO database (fake nearby engine, demo directory in memory, port 3002):

```
[server] nearby engine: fakeNearby (MONGODB_URI is not set)
[office] using the demo directory IN MEMORY (17 employees). Changes are lost on restart; set MONGODB_URI to keep them.
[tick-test] all checks passed
[signal-test] all checks passed
[auth-test] all checks passed
[floor-test] all checks passed
```

Seed twice from an empty database:

```
--- seed run 1
[seed] inserted: 1 floor(s), 5 department(s), 17 employee(s)
[seed] now in the database: 1 floor(s), 5 department(s), 17 employee(s)
--- seed run 2
[seed] inserted: 0 floor(s), 0 department(s), 0 employee(s)
[seed] now in the database: 1 floor(s), 5 department(s), 17 employee(s)
```

Client build (`npx vite build` in client/):

```
✓ 79 modules transformed.
dist/index.html                   0.40 kB │ gzip:   0.27 kB
dist/assets/index-*.css          13.97 kB │ gzip:   3.43 kB
dist/assets/index-*.js          378.88 kB │ gzip: 115.91 kB
✓ built
```

Hand-typed event strings outside `shared/`:

```
grep -rnE "['\"](player|world|players|peers|rtc|server|office|floor):[a-z]+['\"]" server client/src   → no matches
```

## Screenshots (docs/screens/, made by `node server/scripts/screens-walkthrough.js`)

- 01 landing · 02 sign-in, Employee tab with demo chips · 03 sign-in, Admin tab · 04 "Not in the Infotact directory"
- 05 lobby (colour picked, mic meter moving)
- 06 office with the welcome card · 07 zoomed out (61 %) · 08 zoomed in (300 %, crisp pixels) · 09 camera follow after walking
- 10 Ctrl+D at desk A-01 (pulse; Engineering / Design / Marketing borders) · 10b Arjun walks over: "Nearby" + speaker icon (two real headless tabs connected over WebRTC)
- 11 status menu · 12 people panel after "Busy"
- 13 admin overview + mini-map (tier 1, wings B–D closed) · 14 departments · 15 employees + note box
- 16 after 10 sample hires: wing B open, tier 2 · 17 employees with hot desks · 18 alerts: one "Floor 1 is full" + wings opened · 19 overview at 107 people, tier 4, 10 hot desks
- 20 "Add Floor 2" dialog, Engineering → Floor 2 · 21 after Apply: 55 people moved, 10 hot-deskers seated · 22 Riya (online during the move) is now on Floor 2; Ctrl+D finds A-01 there
- 23 `?lab=world` still works · 24 `?lab=office` still works

## CONTRACTS.md v5 in short

- Events: `player:status` (both ways), `office:update`, `floor:change`, `floor:changed`; `player:join { token, avatarColor?, floorId?, status? }`; `world:init` gains `profile` and `office`; players gain `status`, `employeeId`, `role`, `avatarColor`, `department`.
- Rooms: one per floor (room id = floor id); `DEFAULT_ROOM` stays for `{ name }` joins (labs, tests). Signaling rule 6: peers only in the same room, never DND.
- Constants: STATUSES, ROLES, WING_IDS, DESKS_PER_WING, FLOOR_CAPACITY, DEFAULT_FLOOR_ID, TOKEN_TTL_MS, AVATAR_COLORS, ALERT_TYPES; errors BAD_TOKEN, BAD_STATUS, BAD_FLOOR, WING_CLOSED.
- REST: /api/auth/employee, /api/auth/admin, /api/auth/demo, /api/me, /api/office/layout, /api/office/floors/:id, /api/admin/* (overview, departments, employees, sample, floors, apply, alerts).
- Collections: departments, employees, floors, alerts. Map: office.json generated from office-base.json, plus layout.json.
- Interfaces: `attachSignaling(io, { geo, createGeoEngine })` → `{ getOnlineEmployeeIds }`; new `net` functions; optional WorldCanvas props; pure chooseDesk / reserveBlock / resizeBlock / planRebalance / tier functions.

## What you must set on Render (by hand)

1. **proxispeak-server → Environment:** add `AUTH_SECRET` (any long random text, e.g. the output of
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and `ADMIN_PASSWORD` (the Admin tab's password).
   render.yaml lists both with `sync: false`, so Render asks for them; they are never stored in the repo.
   Without AUTH_SECRET every server restart signs everyone out; without ADMIN_PASSWORD admin sign-in is refused.
2. **Seed Atlas** (optional: on start-up the server also seeds an EMPTY database by itself):
   - bash: `MONGODB_URI="<your Atlas string ending in /proxispeak>" node server/office/seed.js`
   - PowerShell: `$env:MONGODB_URI="<your Atlas string>"; node server/office/seed.js`
   Running it twice adds nothing. To start the demo over: `node server/office/reset-demo.js --yes`, then restart the server.
3. Locally, add the same two names to your own `.env` (`.env.example` shows them).

## Known issues / decisions to review

1. **Desks are 128 px apart and earshot is 100 px** (the desk spacing is copied from the original map), so people at neighbouring desks don't hear each other until one steps closer. Fix: tighter rows in build-office-map.js, or a bigger EARSHOT_PX (team decision).
2. A floor can go to hot desks at 97/100 desks: reserved-but-empty desks of OTHER departments are never borrowed (keeps blocks intact). The overview shows this honestly.
3. After growth a department can own patches in several wings (the "elsewhere" step); the mini-map shows it. Moving it to a new floor tidies it into one block again.
4. Name tags overlap when two avatars stand very close.
5. Tokens are stateless (12 h): "Sign out" clears the tab, but a copied token keeps working until it expires. Fine for the demo; production would use Infotact SSO.
6. The office store lives in one server's memory (write-through to MongoDB). Fine for one Render instance; with two servers / Redis (the Week 3+ plan) it needs sharing too.
7. `docs/signaling.md` still describes v3; CONTRACTS.md is the up-to-date v5 reference.
8. The walkthrough's growth / floors steps (and floor-test, which adds Floor 2 if missing) really change the directory: run `node server/office/reset-demo.js --yes` and restart before a demo. My local test database is reset to the clean demo now.
9. I edited Person 3's folder (client/src/world/ and the map) as the brief allowed. Anjali should read the README note before re-exporting from Tiled (export to office-base.json, then run the generator).
10. The area below the original office is outside the building (sky): room for a later annex.
11. After a hard reload of `#/office` the browser may keep sound off until a click; the page shows "Click anywhere to turn on sound" (headless Chrome allows autoplay, so this path was not exercised by the walkthrough).
12. The dev servers I started for testing are stopped. Start them with `npm run dev` in server/ and client/.

## Draft log entry (rewrite it in your own words in docs/logs/aryan.md)

```
## 12 Nov 2026 — Infotact product build (stages 1–6)
- Added sign-in for Infotact: HMAC tokens with Node crypto, a seeded employee directory in MongoDB,
  employee and admin tabs, and a lobby with avatar colours and a mic test.
- The office is full screen now, with camera follow, zoom, a people panel and a status menu;
  Do Not Disturb keeps a player out of every peer set on the server.
- Every floor is its own Socket.io room with its own geo engine; departments sit in desk blocks,
  wings open by tier, overflow hires get hot desks, and the admin adds Floor 2 and moves departments.
- Learned: a pure desk rule is easy to test with made-up data; rooms keep floors apart in every message.
```

## 2-minute demo click path

1. `#/` landing → **Enter the Infotact office**.
2. Sign-in, Employee tab → click the chip **arjun@infotact.demo** → Continue → lobby: pick a colour, **Test microphone** → **Join office**.
   In a second window, do the same as **riya@infotact.demo** (type it; the chips show the first six names).
3. Office: point at the top bar ("Floor 1 · Lobby"); zoom out with **−** to show wing A's department borders and the closed wings; zoom back in.
4. Press **Ctrl+D**: you jump to your desk, it pulses, the top bar says "Engineering". Walk next to Riya: she shows under **Nearby** with the speaker icon and you hear each other, louder as you get closer, left/right by position.
5. Status menu → **Do Not Disturb**: the voice drops (red dot on your name). Back to **Available**.
6. Second window: status menu → **Sign out** → Admin tab → admin@infotact.demo + ADMIN_PASSWORD → **Overview** (mini-map, tier 1).
7. **Employees → Add 10 sample employees** (Engineering) → **Overview**: wing B is open (tier 2); in the office window wing B lights up.
8. **Floors → Add Floor 2** → set Engineering → Floor 2 → **Apply**: Arjun's office window moves to Floor 2 by itself; Ctrl+D finds his new desk.
