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

---

# v6 build — rooms that work, a new office, the remaining spec items

Branch `aryan`. Same rules as before: stage by stage, all tests after each stage, no git writes, no new
packages, constants and event names only in `shared/`, CONTRACTS.md → v6.

## v6 Stage 1 — area engine on the current map — DONE

- Areas are data: `{ id, floorId, name, type, box: [[x1, y1], [x2, y2]] | polygon, platform? }` in map px,
  around the avatar's middle (`AVATAR_MIDDLE` = 12, 16). `build-office-map.js` now also writes
  `layout.areas` (rooms → areas, every desk row → a private desk pod, the town hall's stage = platform).
- Geo engine (`server/geo/`, extended in its own style): `models/Area.js` (`areas` collection),
  `areas.js` (`saveAreas`, `loadAreas`, `usersInArea` = one `find` with `$geoWithin $box`,
  `locateUsers` = ONE aggregate per room per tick: `$match { roomId }` then a `$facet` of `$geoWithin`
  per area and per stage platform), `canHear.js` (pure `canHear(listener, speaker, { connected })`,
  `shouldConnect`, `areaAt`, `isOnPlatform`). Start-up stores every floor's areas in MongoDB and reads
  them back (`[server] floor-1: 26 areas stored in MongoDB`).
- Tick (`server/signaling/tick.js`, rewritten): positions → `locateUsers` → `findNearby` → per mover:
  candidates = nearby ∪ current peers ∪ everyone in the same private area / stage hall; the rules decide;
  modes are per direction (`peerModes`); `peers:update` now carries real `mode`s and `changed[]`;
  MAX_PEERS = 8 enforced for both people (the least relevant link makes way: full links, then the nearest).
  The tick logs `[tick] stats 5s: … avg / p95 / max ms … peers/user` every TICK_STATS_LOG_MS.
- Labs and robot tests (`{ name }` joins in `office-1`) have no areas → plain proximity, unchanged.
- Area chat: `chat:send { text }` → the server finds the sender's area in memory and sends
  `chat:message { areaId, areaName, from, text, t }` to the people standing in it only (open floor →
  `BAD_CHAT`). Nothing is stored.
- Office UI: inside a private / silent / stage area the map is dimmed with a dark film (the area cut out,
  light outline); the top bar shows the area name + a Private / Silent / Stage badge; the right panel
  switches to the area chat (Chat button in the bottom bar); leaving the area shows People again.
- `$geoWithin` + `.explain()`: `node server/geo/scripts/explain-geowithin.js` →
  `IXSCAN (loc_2d_roomId_1)`, nReturned 3, keys examined 10, docs examined 3.
- Tests: new `room-rules-test.js` 31/31 (every rule of canHear), `area-test.js` (private full at 450 px,
  outside 50 px hears nothing, chat isolation, BAD_CHAT, walking out, silent, stage full/falloff,
  `changed` → full), `peer-cap-test.js` (12 robots on one spot: counts 8 8 8 8 8 8 8 8 8 8 8 6,
  symmetric, a farther robot never pushes out nearer links). All old tests still pass.

## v6 Stage 2 — new office layout — DONE

- The floor is generated by code: `server/scripts/office-map/plan.js` (the plan), `builder.js` (floors,
  dark wall tops with automatic 2-tile wall faces on the south side, doors, stamps, collision),
  `tiles.js` (the palette: only the three LimeZu tilesets already in the repo). `build-office-map.js`
  writes `office.json` (110 × 80 tiles, layers floor / rugs / walls / furniture / decor / collision +
  object layers zones / spawn) and `layout.json` (desks, hot desks, neighbourhoods, areas, labels,
  spawn, elevator, mapHash). A flood fill checks every desk, hot desk and the elevator can be reached
  on foot from the lobby, or the build stops with a clear message.
- What is on the floor: Stage hall (platform, 8 rows of audience chairs) · Boardroom (10-12) · Meeting
  rooms 2 and 3 (6-8) · Meeting rooms 4, 5, 6, 7 (2-4) · Focus rooms 1 and 2 (desks, bookcases) ·
  4 phone booths · 4 desk neighbourhoods (A-D, 25 desks each as pods of 6/4/6/4/5, trees between the
  pods, alternating warm woods) · Library lounge (bookcases, 2 sofa corners) · Café (3 tables) ·
  Kitchen (bar shelves, stoves, fridges, coffee counter with stools, 6 tea tables) · Lobby (reception,
  coffee bar, 2 sofa corners, waiting sofas, elevator on the wall, front door) · Hot desks (14 desks in
  2 pods + a sofa corner) · paved terrace and plaza with trees and planters. No sky: the edge is the
  terrace, beyond it a dark background (#1b2030).
- Areas (62): 1 stage (+ platform), 47 private (meeting rooms, booths, 20 desk pods, 2 hot-desk pods,
  9 tea / café tables, 6 sofa corners), 2 silent, 12 open (corridors, lounges, kitchen, café, hot desks,
  neighbourhoods, terrace; lobby is `lobby`). Each is also a rectangle in the map's `zones` layer.
- Tiers unchanged (25/50/75/100): a closed neighbourhood is now a light "dust sheet" with a red rope
  and brass posts and a "Neighbourhood C · Coming soon" sign (still not walkable; the server refuses
  moves into it). Department outlines are now built from the tiles their desks cover (any shape).
- No grass tiles exist in the tilesets, so the "garden" is a paved terrace with potted trees, palms and
  planters (closest available). Anjali's pieces kept: her meeting table (same tiles) in every meeting
  room, her reception desk, her lounge sofas and lamp, her salmon walls and striped floor (README §7).
- DEFAULT_SPAWN (labs, robot tests) moved to the lobby (1632, 2104); the World Lab bots start in the
  lobby, corridor, kitchen, lounge and hall. Zoom now goes down to 30 % (the whole floor on screen);
  labels show from 45 %. The landing preview `office-preview.png` was re-captured from the new map.
- Tests: all 11 suites pass on the new layout (office-rules 27/27 incl. snake numbering and 14 hot
  desks; area-test picks its rooms from the layout, so it runs on any map).

## v6 Stage 3 — movement speed — DONE

- `WALK_SPEED_PX_PER_SEC` 220 (was 180 in WorldCanvas) and `RUN_SPEED_PX_PER_SEC` 440 (hold Shift) are
  now shared constants. The step is still speed × deltaTime (capped at 0.05 s), so every screen rate
  walks at the same speed. While running, three speed lines trail behind my avatar.
- Server speed check (`server/signaling/moveCheck.js`): a movement budget that fills at the run speed
  and holds at most MOVE_BUDGET_MS (250 ms → 110 px); each move spends its length; a longer move is
  shortened to the budget (never refused, so a slow network can't get anyone stuck). Free jumps: the
  first move after joining / changing floor (reconnects), my own desk (Ctrl+D), the lobby spawn and the
  elevator. Labs and robot tests (`{ name }` joins) are not checked.
- Test: new `move-speed-test.js` 8/8 (walk and run for 5 s never shortened; a 2× cheat is held to the
  run speed; a 900 px jump is cut to 110 px; desk / lobby / elevator jumps allowed; someone else's desk
  not; labs unchecked). All robot tests still pass (they walk at running speed after their first jump).

## v6 Stage 4 — walls block sound — DONE

- `client/src/world/soundWalls.js`: `buildWallGrid(map)` (one byte per tile from the `walls` layer: wall
  tops and wall faces, built once on map load) and `isWallBetween(grid, ax, ay, bx, by)` (a grid
  traversal from tile to tile along the straight line; the two people's own tiles don't count).
- WorldCanvas fills `frame.others[].blocked` every frame, for people within DISCONNECT_PX, ONLY when
  both of us are on open floor (inside private rooms and the stage hall the server's rules decide).
- Mixer (`client/src/audio/mixer.js`): a blocked voice plays at `WALL_MUFFLE_GAIN` (0.3); a 'full'
  voice at a constant `distanceToGain(TILE_SIZE)` ≈ 0.77 (face to face one tile apart); every mode
  change, wall change and new voice fades over `AUDIO_FADE_MS` (300 ms: setTargetAtTime with a 0.1 s
  time constant), normal movement keeps the 50 ms smoothing. `getPeerDiagnostics()` adds `blocked`.
- People panel: a "muffled" icon (speaker behind a bar) instead of the speaker icon for voices behind a
  wall. "Nearby" now also lists everyone in my room (any distance) and anyone I can hear.
- Test: new `wall-ray-test.js` 13/13 (made-up grid: same side, straight, diagonal, through a door,
  symmetric, standing in a doorway; real map: corridor, boardroom wall, boardroom door, lobby ↔
  kitchen wall, neighbourhood ↔ corridor; 0.36 µs per check).

## v6 Stage 5 — room persistence — DONE

- `rooms` collection (`server/geo/models/Room.js`): `{ _id: floorId, floorId, name, map (Tiled JSON),
  desks, areas, version, source: 'generated' | 'uploaded', mapHash, updatedAt }`. `server/geo/rooms.js`:
  `ensureGeneratedRoom` (start-up: store the generated layout as v1, a new version when its mapHash
  changed, keep an uploaded one), `saveUploadedRoom`, `loadRoom`, `listRooms`, `validateTiledMap`
  (orthogonal, 32 px tiles, ≤ 128 × 128, embedded tilesets, tile layers floor / walls / furniture /
  collision with full data, object layers zones / spawn, a `spawn` point, every zone with a valid
  zoneType + name) and `areasFromTiledMap` (rectangles → box, polygons → polygon, stage `platform`
  property). In memory when MongoDB is not connected.
- Routes (`server/geo/routes.js`, mounted in `server/index.js`): `GET /api/rooms/:id` (anyone),
  `GET /api/rooms` (admin), `POST /api/rooms/:id/layout` (admin, up to 5 MB; the global JSON parser
  skips this one address), `POST /api/rooms/:id/generated` (admin, back to the generated layout).
  After an upload: the floor's areas are replaced (memory + `areas` collection), everyone on it is
  re-checked by the next tick, and the floor gets `layout:update { floorId, version }`.
- Start-up log: `[server] floor-1: layout version 1 (generated), 62 areas stored in MongoDB`.
- Client: the office loads its floor's map from `GET /api/rooms/:floorId` (WorldCanvas `mapData`
  prop; `loadOfficeMap` accepts a map object) and falls back to `/maps/office.json` if that fails, so
  the labs keep working; on `layout:update` it reloads the map and the areas.
- Admin → **Layouts**: stored layouts (floor, version, Generated / Uploaded, areas, desks, saved date),
  Download (the stored Tiled JSON), "Use generated", and **Upload layout (Tiled JSON)** with the
  server's error list shown on failure.
- Test: new `rooms-test.js` 14/14 (load, 404, 401, list, 403 for employees, 3 kinds of bad upload,
  upload → v2 + layout:update + new area + desks kept, the uploaded area works at once (216 px apart →
  full), back to generated → v3).

## v6 Stage 6 — mesh scaling, 50-user load test, 60 FPS — DONE

- MAX_PEERS (8): enforced in the tick for both people of a pair (Stage 1); `peer-cap-test.js` and the
  packed load test (max exactly 8) show it.
- Audio: every connection's audio sender gets `maxBitrate = AUDIO_MAX_BITRATE_BPS` (32 kbps) through
  `RTCRtpSender.setParameters` once the connection is 'connected'; logged once per page
  (`[rtc] audio send limit: 32 kbps per connection`).
- `server/scripts/load-test.js --bots=50 --seconds=30 --spread|--packed`: bots sign in as directory
  people, join floor-1, walk at MOVE_SEND_HZ with the browser's collision and outside closed
  neighbourhoods. The server logs `[tick] stats 5s: … avg … p95 … max … moved … peers/user …` every 5 s
  and `/api/health` returns the last window (`tick`). Per-pair tick log lines are skipped above 20 people.
- Results (`docs/load-test.md`, raw `docs/load-test-runs.txt`): spread — tick avg 25–28 ms, p95 ≤ 46 ms,
  peers avg 0.8 / max 4; packed (all 50 in the lobby) — avg 35–49 ms, worst 168 ms, peers avg 5.8 /
  max 8, 180 peers:update/s; no server errors; players:state 9.3/s per bot.
- FPS counter in the office: press **F** (`FPS 140 · 52 people`). With the packed load test on the floor:
  135–140 FPS in headless Chrome (not tied to a 60 Hz screen: this is headroom; normal browsers draw at
  the display's 60 FPS).

---

# v6 FINAL REPORT

## Stages

| Stage | Status |
|---|---|
| 1 Area engine (areas in MongoDB, $geoWithin, canHear, tick modes + changed[], highlight + film, area chat) | ✅ done |
| 2 New office layout (generated, Gather-like, every room an area, coming-soon neighbourhoods) | ✅ done |
| 3 Movement speed (220 px/s, Shift = 440 px/s, server speed check) | ✅ done |
| 4 Walls block sound (grid ray walk, 30 % muffle, muffled icon) | ✅ done |
| 5 Room persistence (`rooms` collection, GET /api/rooms/:id with static fallback, admin Layouts + upload) | ✅ done |
| 6 Mesh scaling (8-peer cap, 32 kbps, 50-bot load test, FPS) | ✅ done |

No git write commands were run. No npm packages were added. `.env` was not changed (I only listed its
key names, to confirm MONGODB_URI and ADMIN_PASSWORD are set).

## Files changed (one line each)

Shared / root
- `shared/constants.js` — v6: AVATAR_MIDDLE, WALK/RUN_SPEED_PX_PER_SEC, MOVE_BUDGET_MS, CHAT_MAX_CHARS, WALL_MUFFLE_GAIN, AUDIO_FADE_MS, AUDIO_MAX_BITRATE_BPS, TICK_STATS_LOG_MS, BAD_CHAT; DEFAULT_SPAWN → lobby; comments for ZONE_TYPES / MAX_PEERS.
- `shared/events.js` — CHAT_SEND, CHAT_MESSAGE, LAYOUT_UPDATE; PEERS_UPDATE mode / changed comment.
- `CONTRACTS.md` — v6 (sections 3, 4, 4c, 6, 7, 9, 9b, 10, 11, 12 change log, 13).

Server
- `server/index.js` — stores each floor's layout (rooms) and areas at start-up, mounts the rooms router, LAYOUT_UPDATE after uploads, JSON limit exception for uploads, tick stats in /api/health.
- `server/geo/canHear.js` (new) — pure room rules: canHear, shouldConnect, areaAt, isOnPlatform, polygon test.
- `server/geo/areas.js` (new) — saveAreas / loadAreas, usersInArea ($geoWithin find), locateUsers ($facet of $geoWithin), shapeOf.
- `server/geo/models/Area.js` (new) — the `areas` collection.
- `server/geo/models/Room.js` (new) — the `rooms` collection.
- `server/geo/rooms.js` (new) — ensureGeneratedRoom, saveUploadedRoom, loadRoom, listRooms, validateTiledMap, areasFromTiledMap (in memory without MongoDB).
- `server/geo/routes.js` (new) — GET /api/rooms, GET /api/rooms/:id, POST /api/rooms/:id/layout, POST /api/rooms/:id/generated.
- `server/geo/geoEngine.js` — engine methods usersInArea, locateUsers.
- `server/geo/index.js` — exports the new geo functions.
- `server/geo/scripts/explain-geowithin.js` (new) — prints the $geoWithin query and its .explain().
- `server/signaling/tick.js` — rewritten: areas per room, room rules, per-direction modes, changed[], MAX_PEERS with relevance ranking, net-result peers:update, stats log, recheckRoom, getLastTickStats.
- `server/signaling/roomAreas.js` (new) — each room's areas in memory (labs: none).
- `server/signaling/areaChat.js` (new) — chat:send → chat:message to the same area only, BAD_CHAT.
- `server/signaling/moveCheck.js` (new) — movement-budget speed check with allowed jumps.
- `server/signaling/index.js` — chat handler, speed check on moves, free move after join.
- `server/signaling/officeRooms.js` — free move after a floor change.
- `server/office/layout.js` — `officeMap()` (the generated Tiled map, for the rooms collection).
- `server/office/layout.json` — regenerated (110 × 80 office, 66 areas, mapHash).
- `server/scripts/build-office-map.js` — rewritten: writes office.json + layout.json from the plan.
- `server/scripts/office-map/plan.js`, `builder.js`, `tiles.js` (new) — the floor plan, the map painter, the tile palette.
- `server/scripts/capture-map-preview.js` — dark background.
- `server/scripts/robots.js` (new) — shared robot helpers.
- `server/scripts/room-rules-test.js`, `move-speed-test.js`, `wall-ray-test.js`, `area-test.js`, `peer-cap-test.js`, `rooms-test.js` (new) — tests.
- `server/scripts/load-test.js` (new) — the 50-bot load test.
- `server/scripts/screens-v6.js` (new) — headless screenshots 25–36.

Client
- `client/src/world/WorldCanvas.jsx` — area detection + film, onAreaChange, mapData, Shift running + speed lines, blocked flags (wall ray), showFps, min zoom 30 %, no redundant first move.
- `client/src/world/areas.js` (new) — areaAt, isClosedArea, traceArea (browser copy, for drawing).
- `client/src/world/soundWalls.js` (new) — buildWallGrid, isWallBetween.
- `client/src/world/officeOverlay.js` — area film, tile-based department outlines, "coming soon" neighbourhoods, run lines, labels from 45 %.
- `client/src/world/map.js` — loadOfficeMap accepts a map object.
- `client/src/world/fakeNet.js` — v6 net functions (no-ops), new bot start spots.
- `client/src/world/index.js` — exports areaAt, isClosedArea.
- `client/src/world/README.md` — §7 note for Anjali about the generated office.
- `client/src/audio/mixer.js` — full gain = distanceToGain(TILE_SIZE), WALL_MUFFLE_GAIN, AUDIO_FADE_MS fades, blocked in diagnostics.
- `client/src/rtc/rtcManager.js` — 32 kbps audio cap via setParameters.
- `client/src/net/index.js` — sendChat, onChatMessage, onLayoutUpdate, onServerError.
- `client/src/app/OfficePage.jsx` — stored layout from /api/rooms (static fallback), area chat panel, area name + badge, muffled + room-aware Nearby, F key, dark background, dev-only controller hook.
- `client/src/app/AreaChat.jsx` (new) — the area chat panel.
- `client/src/app/AdminLayouts.jsx` (new) — admin Layouts section (versions, download, upload, use generated).
- `client/src/app/AdminPage.jsx` — Layouts in the sidebar.
- `client/src/app/AdminSections.jsx` — mini-map: dark background, coming-soon neighbourhoods.
- `client/src/app/OfficeParts.jsx` — area badge, Chat button, muffled icon.
- `client/src/app/icons.jsx` — Chat, Muffled, Map icons.
- `client/src/app/app.css` — chat panel, area badges, muffled icon, FPS badge.
- `client/public/maps/office.json` — the new generated office; `client/public/office-preview.png` — re-captured.

Docs
- `docs/build-progress.md` (this file), `docs/load-test.md`, `docs/load-test-runs.txt`, `docs/screens/25…36-v6-*.png`.

## Test and build output (final run, local MongoDB, test server on port 3002)

```
=== node scripts/room-rules-test.js
[rules] PASS  0a. areaAt finds the meeting room by the avatar middle
[rules] PASS  0b. areaAt: corridor (no area) → null
[rules] PASS  0c. polygon areas work (inside the triangle)
[rules] PASS  0d. polygon areas work (outside the triangle, inside its bounding box)
[rules] PASS  0e. on the platform → onPlatform true
[rules] PASS  1a. open: 60 px apart → falloff
[rules] PASS  1b. open: exactly EARSHOT_PX (100) → falloff
[rules] PASS  1c. open: 120 px, not connected yet → silent
[rules] PASS  1d. open: 120 px, already connected → still falloff (gap up to DISCONNECT_PX 140)
[rules] PASS  1e. open: 150 px, connected → silent
[rules] PASS  1f. lobby works like open floor (lobby ↔ corridor, 50 px)
[rules] PASS  2a. same private room, 350 px apart → full (no 100 px limit)
[rules] PASS  2b. same private room, side by side → full
[rules] PASS  2c. outside cannot hear in (corridor 30 px from a person inside)
[rules] PASS  2d. inside cannot hear out
[rules] PASS  2e. two different private rooms side by side → silent
[rules] PASS  2f. polygon private area → full inside
[rules] PASS  3a. focus room: side by side → silent
[rules] PASS  3b. focus room ↔ corridor, 20 px → silent
[rules] PASS  4a. audience hears the speaker on the platform at full, 500 px away
[rules] PASS  4b. the speaker hears a far audience member? no (only by proximity)
[rules] PASS  4c. … but they still connect (the audience needs it)
[rules] PASS  4d. speaker hears a near audience member by falloff
[rules] PASS  4e. two audience members 50 px apart → falloff
[rules] PASS  4f. two audience members 300 px apart → silent, not connected
[rules] PASS  4g. outside the hall cannot hear the speaker
[rules] PASS  4h. two speakers on the platform hear each other at full
[rules] PASS  5a. DND listener in a meeting room → silent
[rules] PASS  5b. DND speaker on the stage → silent to the audience
[rules] PASS  5c. DND on open floor, side by side → silent
[rules] PASS  5d. busy is not DND (open floor, 40 px → falloff)
[rules] all checks passed
=== node scripts/move-speed-test.js
[speed-test] PASS  1. the first move after joining may jump anywhere (a reconnect)
[speed-test] PASS  2. walking (220 px/s) for 5 s: never shortened
[speed-test] PASS  3. running with Shift (440 px/s) for 5 s: never shortened
[speed-test] PASS  4. a cheat at twice the run speed for 3 s is held to the run speed (x 2386 ≤ 2430)
[speed-test] PASS  5. a 900 px jump is shortened to the budget (110 px)
[speed-test] PASS  6. Ctrl+D to my own desk, the lobby and the elevator are allowed jumps
[speed-test] PASS  7. a jump to someone else's desk is shortened
[speed-test] PASS  8. labs and robot tests (no employee) are not checked
[speed-test] all checks passed
=== node scripts/wall-ray-test.js
[wall-test] PASS  1a. same side of the wall → not blocked
[wall-test] PASS  1b. straight across the wall → blocked
[wall-test] PASS  1c. diagonally across the wall → blocked
[wall-test] PASS  1d. through the door (y = 4) → not blocked
[wall-test] PASS  1e. both directions give the same answer
[wall-test] PASS  1f. standing in the doorway, talking to someone on the other side → not blocked
[wall-test] PASS  2a. the map has a walls layer with wall tiles
[wall-test] PASS  2b. two people in the north corridor, 3 tiles apart → not blocked
[wall-test] PASS  2c. boardroom (inside) ↔ corridor, through the wall → blocked
[wall-test] PASS  2d. boardroom ↔ corridor, straight through its open door → not blocked
[wall-test] PASS  2e. lobby ↔ kitchen through the wall between them → blocked
[wall-test] PASS  2f. a neighbourhood ↔ the corridor south of it (no wall) → not blocked
[wall-test] PASS  3. one check takes 0.29 µs (8 peers × 60 FPS = 480 checks/s → well under 1 ms a second)
[wall-test] all checks passed
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
=== node scripts/join-test.js
[join-test] done: all expected events arrived
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
=== node scripts/tick-test.js
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
=== node scripts/signal-test.js
[signal-test] PASS  1. A → B offer: B gets { from: A, data } with identical data
[signal-test] PASS  2. forged from: 'hacker' is ignored: B sees A's real id
[signal-test] PASS  3a. B → A answer is delivered with from = B
[signal-test] PASS  3b. B → A candidate is delivered with from = B
[signal-test] PASS  4. signal to an unknown id → BAD_SIGNAL
[signal-test] PASS  5a. A → C while C is far away → BAD_SIGNAL (not in earshot)
[signal-test] PASS  5b. C received no signal
[signal-test] PASS  6a. missing `to` → BAD_SIGNAL
[signal-test] PASS  6b. data.type 'nonsense' → BAD_SIGNAL
[signal-test] PASS  6c. null payload → BAD_SIGNAL
[signal-test] PASS  7. signal before joining → NOT_JOINED
[signal-test] all checks passed
=== node scripts/reconnect-test.js
[reconnect-test] PASS  1. A gets a new world:init with a new selfId
[reconnect-test] PASS  2. B gets player:left for A's old id
[reconnect-test] PASS  3. B gets player:joined for A's new id
[reconnect-test] PASS  4. B's peers:update lists A's old id in left
[reconnect-test] PASS  5. B's peers:update lists A's new id in entered
[reconnect-test] PASS  6. tab closed: B gets player:left and peers:update left for A
[reconnect-test] PASS  7. refreshed tab joins as a new player: B gets player:joined and peers:update entered
[reconnect-test] all checks passed
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
=== node scripts/floor-test.js
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
[floor-test] PASS  5. a move into closed wing C → WING_CLOSED
[floor-test] PASS  7. an admin change → office:update for floor-1 with tier, open wings and departments
[floor-test] PASS  6. a name join asking for a floor change → BAD_FLOOR
[floor-test] all checks passed
=== node scripts/area-test.js
[area-test] PASS  1a. "Boardroom (10-12)": A and B 639 px apart are connected, mode full
[area-test] PASS  1b. C outside the room, 54 px from B: connected to nobody inside
[area-test] PASS  2a. chat inside reaches A and B, with the area name
[area-test] PASS  2b. chat inside does NOT reach C outside
[area-test] PASS  2c. chat on open floor → BAD_CHAT
[area-test] PASS  3a. B walked out: A and B are no longer connected
[area-test] PASS  3b. B and C, side by side on open floor: connected, falloff
[area-test] PASS  4. "Focus room 1" (silent): two robots 20 px apart never connect
[area-test] PASS  5a. audience 787 px from the platform hears the speaker at full
[area-test] PASS  5b. the speaker gets that audience member as falloff (receive-only)
[area-test] PASS  5c. two audience members 30 px apart in the front row: falloff
[area-test] PASS  5d. the second person stepped onto the platform → the front row gets changed: full
[area-test] all checks passed
=== node scripts/peer-cap-test.js
[peer-cap-test] PASS  1a. 12 robots on one spot: nobody has more than 8 peers (counts 8 8 8 8 8 8 8 8 8 8 8 6)
[peer-cap-test] PASS  1b. everybody has at least one peer
[peer-cap-test] PASS  1c. every connection is listed on both sides
[peer-cap-test] PASS  1d. the crowd is well connected: 47 links (at least 42)
[peer-cap-test] PASS  2a. with a 13th robot 95 px away, still nobody above 8
[peer-cap-test] PASS  2b. the crowd kept all its (nearer) links; the far robot only took free slots (1 peers, 1 crowd members had room)
[peer-cap-test] all checks passed
=== node scripts/rooms-test.js
[rooms-test] PASS  1a. GET /api/rooms/floor-1 → the stored Tiled map, a version and the areas
[rooms-test] PASS  1b. a floor that does not exist → 404
[rooms-test] PASS  1c. the list of layouts needs an admin token → 401 without one
[rooms-test] PASS  1d. admin: GET /api/rooms lists floor-1 with its version and date
[rooms-test] PASS  1e. an employee may not upload a layout → 403
[rooms-test] PASS  2a. not a Tiled map → 400 with a clear message
[rooms-test] PASS  2b. layers missing → 400 listing them ("walls", "zones")
[rooms-test] PASS  2c. a zone with an unknown zoneType → 400
[rooms-test] PASS  3a. a valid upload → saved as version 5, source uploaded
[rooms-test] PASS  3b. everyone on floor-1 gets layout:update with the new version
[rooms-test] PASS  3c. GET again → the new version, with the new area
[rooms-test] PASS  3d. the desks are kept (they belong to the directory)
[rooms-test] PASS  4. inside the uploaded "Test corner", 216 px apart → connected, mode full
[rooms-test] PASS  5. back to the generated layout → version 6, source generated, no test area
[rooms-test] all checks passed
```

(Each script prints "all checks passed" / "done" only when every check passed, and exits with code 1
on any FAIL. All 14 exited with code 0.)

Against a server with NO database (fake nearby engine, demo directory and rooms in memory, port 3003):

```
[server] nearby engine: fakeNearby (MONGODB_URI is not set)
[server] floor-1: layout version 1 (generated), 66 areas (in memory)
[tick-test] all checks passed
[area-test] all checks passed
[peer-cap-test] all checks passed
[rooms-test] all checks passed
[auth-test] all checks passed
[floor-test] all checks passed
```

Map build and client build:

```
[map] wrote client/public/maps/office.json (110 × 80 tiles, 147 KB)
[map] wrote server/office/layout.json: 100 desks in 4 neighbourhoods, 14 hot desks, 66 areas (1 stage, 47 private, 2 silent, 15 open, 1 lobby), 25 labels
[map] every desk, hot desk and the elevator can be reached on foot from the lobby
dist/assets/index-*.css   15.49 kB │ gzip:   3.81 kB
dist/assets/index-*.js   394.13 kB │ gzip: 120.99 kB
✓ built
grep for hand-typed event strings in server/ and client/src → no matches
```

## The $geoWithin query and its explain()

`node server/geo/scripts/explain-geowithin.js` (3 probes inside Meeting room 2, 37 elsewhere):

```
[geo] area "Meeting room 2 (6-8)" box [[1408,128],[1760,608]] (avatar-middle px)
[geo] query: Position.find({"roomId":"__explain__","loc":{"$geoWithin":{"$box":[[1396,112],[1748,592]]}}}, { _id: 1 })
[geo] answer: ["__in0__","__in1__","__in2__"]
[geo] explain: winning plan PROJECTION_SIMPLE ← FETCH ← IXSCAN (loc_2d_roomId_1)
[geo] explain: nReturned 3, totalKeysExamined 4, totalDocsExamined 3, executionTimeMillis 6
[geo] locateUsers (one $facet aggregate over 66 areas): [["__in0__",{"areaId":"meeting-2",…}], …]
```

The box is shifted by AVATAR_MIDDLE (12, 16), because positions store the avatar's top-left. The query
uses the 2d index (IXSCAN), examines 4 index keys and fetches only the 3 matching documents. In the tick,
the same `$geoWithin` shapes run as one `$facet` aggregate per room (66 areas + the stage platform),
after a `$match` on roomId.

## Load test and FPS

| Run | Tick avg | Tick p95 | Tick max | Peers / bot avg · max | Errors |
|---|---|---|---|---|---|
| 50 bots spread, 30 s | 25–28 ms | 31–46 ms | 46 ms | 0.8 · 4 | none |
| 50 bots packed, 30 s | 35–49 ms | 43–168 ms | 168 ms | 5.8 · 8 | none |
| 50 bots packed + browser, 40 s | 50 ms | 125 ms | 125 ms | 5.4 · 8 | none |

FPS (F key) with 52 people drawn in the lobby: 135–140 in headless Chrome (headroom over 60 FPS).
Details and what the numbers mean: `docs/load-test.md`.

## Screenshots (docs/screens/, `node server/scripts/screens-v6.js`)

- 25 the new layout zoomed out (30 %): neighbourhoods A and B open with department outlines, C and D "coming soon"
- 26 private area highlight + area chat (Meeting room 2: film, PRIVATE badge, a message each way)
- 27 a meeting room with 3 people (Boardroom; Nearby lists both others)
- 28 the stage hall (speaker on the platform, audience in the chairs, STAGE badge, hall chat)
- 29 a focus room (SILENT badge, "microphones are off" note)
- 30 Shift-running in the corridor (speed lines)
- 31 a voice behind a wall: two real browser tabs either side of the lobby/kitchen wall, muffled icon
- 32 a closed neighbourhood: dust sheet, rope, "Coming soon" sign
- 33 FPS counter with the 50-bot packed load test on the floor (FPS 140 · 52 people)
- 34 admin → Layouts (versions, Download, Upload layout (Tiled JSON)) · 35 admin overview mini-map
- 36 the load-test output

## Known issues / decisions to review

1. **No grass tiles** exist in the three tilesets, so the "garden" is a paved terrace with potted
   trees, palms and planters, with a dark background beyond the map edge (the closest available).
2. **Uploaded layouts keep the generated desks, spawn and elevator** (desks belong to the employee
   directory). A map that moves desks would put people at the old spots; editing desks needs the
   generator (plan.js).
3. **The mesh limits a stage talk to 8 listeners** (MAX_PEERS): the 8 nearest audience members hear the
   speaker. More needs a media server (SFU). Same for very large rooms (none on this map is above 12).
4. **Speed check exemption**: the first move after a join is free (a reconnect puts you back where you
   were), so someone could reconnect to jump once. Acceptable for the demo.
5. **Two sources for "which area"**: the tick uses the stored areas via `$geoWithin` every 250 ms; area
   chat uses the same areas in memory at send time. At a doorway they can disagree for up to one tick.
6. **Area chat has no rate limit**, and people on DND still see and send area chat (DND is about voice).
7. **Department blocks still follow the snake order** (the desk rule is unchanged), so one department
   can span two pods; each part gets its own outline. Honest, but it can look split.
8. **Load-test bots share names** (26 directory people for 50 bots); the directory is never changed.
9. **Headless FPS is not capped at 60**, so 140 FPS shows headroom, not what a user sees (60).
10. **A one-off silent server stop** happened on my very first load-test attempt (my test server, at
    25 joins, no error printed). I could not reproduce it in six later 30–40 s runs with 50 bots. Worth
    keeping an eye on in Render's logs.
11. **The dev server on 3001 restarted several times** (nodemon) while I edited. Once it failed to start
    for about a minute because of a typo of mine in server/index.js, fixed straight away.
12. **The local database is not the clean demo** (27 employees, 2 floors, layout versions v4 / v2 from
    testing). Before a demo: `node server/office/reset-demo.js --yes`, then restart the server.
13. **Anjali's original office is no longer one block on the map**; its pieces are reused (README §7).
14. `window.__officeController` exists only in the Vite development build (for the screenshot script).
15. Ctrl+D still jumps (no path-finding), as before.
16. **I edited other people's folders** (server/geo/, client/src/world/, client/src/audio/) because this
    brief asked for it; Pratik, Anjali and Koushik should read the comments at the top of the new files.

## Draft log entry (rewrite it in your own words in docs/logs/aryan.md)

```
## 12 Nov 2026 — v6: rooms that work, a new office, scaling
- Areas are now data: every room on the map is an area with a type (open, private, silent, stage),
  stored in MongoDB; the tick finds who is in which area with one $geoWithin aggregate and applies canHear.
- Private rooms give everyone inside a constant volume, focus rooms are silent, the stage reaches the
  whole hall; peers:update carries real modes and changed[]; MAX_PEERS 8 is enforced on both sides.
- Drew a new Gather-style office with a generator script; walls now muffle voices on open floor;
  Shift runs; layouts are versioned in a rooms collection with an admin upload.
- Load test: 50 bots, tick 25-50 ms on average (worst 168 ms packed), max 8 peers, ~140 FPS headless.
- Learned: a pure canHear is easy to test rule by rule; $geoWithin finds the points inside a shape,
  so "who is in which room" is asked per room, not per person.
```

## 2-minute demo click path

1. Reset first: `node server/office/reset-demo.js --yes`, restart the server. Open `#/` → **Enter the Infotact office**.
2. Sign in as **riya@infotact.demo** → lobby → **Join office**. You stand in the lobby by reception
   (top bar: "Lobby"). Zoom out with **−** to 30 %: the whole floor, the closed neighbourhoods "coming soon".
3. Second window: **arjun@infotact.demo**. Walk both into **Meeting room 2** (north corridor; hold
   **Shift** to run): the map dims outside the room, the top bar says "Meeting room 2 (6-8) · PRIVATE",
   the Chat panel opens. Stand at opposite ends: still full volume. Send a chat message; the other
   window gets it. Riya walks out: the voice fades away and the chat closes.
4. Arjun goes into **Focus room 1**: SILENT, nobody hears anybody.
5. Both go to the **Stage hall**: Arjun steps onto the platform; Riya sits at the back and hears him at
   full volume across the hall.
6. Riya stands in the lobby by the kitchen wall, Arjun on the kitchen side: the People panel shows the
   **muffled** icon (his voice at 30 %).
7. Press **F**: the FPS counter. Optional: `node scripts/load-test.js --bots=50 --seconds=30 --packed`
   fills the lobby with 50 walking bots.
8. Sign out → Admin → **Layouts**: Floor 1's version and date; **Download**, then **Upload layout (Tiled
   JSON)** with the same file: version + 1, and the office window reloads its map. **Use generated** goes back.
