# ProxiSpeak — Work Distribution (Draft v1)

*Updated 18 Oct 2026. The plan is compressed because the team meeting moved to 15 Oct. This file becomes the Work Distribution Document Infotact asks for before the mid review.*

Each person's tasks and calendar are in `docs/briefs/module-N-….md`.

---

## 1. Who owns what

| Person | Module | Folders they own | Name | Branch |
|---|---|---|---|---|
| Person 1 (team lead) | 1. Signaling + WebRTC | `server/index.js`, `server/signaling/`, `server/scripts/`, `client/src/net/`, `client/src/rtc/`, `client/src/App.jsx`, `client/src/main.jsx`, `shared/`, root files, `.github/` | Aryan | `aryan` |
| Person 2 | 2. Geospatial engine | `server/geo/` | Pratik | `pratik` |
| Person 3 | 3. 2D world | `client/src/world/`, `client/public/maps/`, `client/public/assets/` | Anjali | `anjali` |
| Person 4 | 4. Spatial audio | `client/src/audio/`, `client/public/sounds/` | Koushik | `koushik` |

**Rule:** you edit only your own folders. Need something changed somewhere else? Ask its owner. For shared files (`shared/`, `CONTRACTS.md`, `AGENTS.md`, package files), ask Person 1.

---

## 2. Week by week

| | Person 1: Signaling + WebRTC | Person 2: Geospatial engine | Person 3: 2D world | Person 4: Spatial audio |
|---|---|---|---|---|
| **Week 1** (15–20 Oct) | Socket.io server; join, move, leave; all positions broadcast 10×/sec; browser `net` connection | MongoDB setup (local + Atlas); position schema with 2d index; fake-user seed script; first `$near` query | React canvas; game loop with FPS counter; keyboard movement; office map built in Tiled | Audio lab page; sound → volume knob → left/right knob → speakers; distance→volume and direction→pan formulas |
| **Week 2** (21–26 Oct) | 250 ms proximity tick; signaling relay (offer, answer, ICE); microphone; two browsers talking | Batch position writes; connect/disconnect rule (100/140 px); spatial audit script proving < 20 ms | Position sending 10×/sec; smooth movement for others; walls block walking; sprites and names; 50-bot speed check | Mixer for many voices; draggable fake avatar; mic level meter and mute button; Chrome audio fixes |
| **Mid review** (27–30 Oct) | Two browsers talking through our signaling server | Spatial audit: 50 users, every query under 20 ms | Several avatars walking smoothly around the office at 60 FPS | Sound gets louder and shifts ears as a fake avatar moves |
| **Week 3** (27 Oct – 2 Nov) | Redis adapter + two server copies; 50-bot load test; nearest-8 cap; lower voice data rate | Zones in MongoDB; who is in which zone (`$geoWithin`); hearing rules (open, private, silent) | Zone areas drawn on the map; wall line-of-sight check; wall info passed to audio | Real voices through the mixer; walls muffle voices; `full` vs `falloff` modes |
| **Week 4** (3–7 Nov) | Stage (one-way connections); zone-aware connections; TURN; final demo | Room Persistence: office maps and walls saved in MongoDB; rooms API; deploy backend + Atlas | 60 FPS polish (draw the static map once); stage visuals; deploy frontend | Stereo polish; "who's near" volume list; silent zone; final sound tuning |
| **Final review** (~8–13 Nov) | Full app deployed; 50-bot load test; Redis scaling | Zones and saved maps working from the database | Smooth, polished world at 60 FPS | Immersive audio: distance, direction, walls, zones |

---

## 3. Handoffs: who gives what to whom

Until each handoff, the receiving person uses a fake, so nobody waits.

| When | From → To | What | Until then |
|---|---|---|---|
| Sun 18 Oct | P1 → P3 | `net` connection (send my position, receive others) | P3 uses `fakeNet.js` |
| Wed 21 Oct | P2 → P1 | Geo engine (`findNearby`, batch writes, connect/disconnect rule) | P1 uses a simple distance check |
| Fri 23 Oct | P3 → P4 | `onFrame` (positions every frame) | P4 drags a fake avatar |
| Week 3 | P1 → P4 | Real voice streams (`onRemoteStream`) | P4 uses sample sound files |
| Week 3 | P3 → P2 | Map file with the `zones` layer | P2 uses one hand-written test zone |
| Week 3 | P2 → P1 | Hearing rules (`canHear`) | Everyone counts as open proximity |

---

## 4. Integration calendar

Twice a week, Person 1 merges everyone's pull requests into `dev` and runs the full app (process in Part 1, "When something breaks"). **Open your pull request into `dev` by the morning of each integration day.**

| Date | Round | Goal |
|---|---|---|
| Sat 17 Oct | Setup check | Everyone's branch exists, the skeleton is in, and each person's work runs on their laptop |
| Wed 21 Oct | #1 | Avatars from two browser tabs move on each other's screens |
| Sat 24 Oct | #2 | **Mid freeze:** everything for the mid review works together. After this, only fixes |
| Wed 28 Oct | #3 | Skip if it clashes with the mid review |
| Sat 31 Oct | #4 | Real voices in the mixer |
| Wed 4 Nov | #5 | Zones and saved maps |
| Sat 7 Nov | #6 | **Final freeze** and deployment check |

`dev` is not connected to the dashboard. Code only flows from personal branches into `dev`, never back.

---

## 5. Shared duties (proposal)

| Duty | Who |
|---|---|
| README, this document, Infotact submissions | Person 1 |
| Mid-review social media video | Person 3 |
| Final-review social media video | Person 4 |
| Presentation (PPT) | Everyone makes 2–3 slides about their module; Person 1 assembles |
| Project report | Everyone writes their module's chapter; Person 1 writes the intro and architecture and assembles |
| Deployment (Week 4) | P2 backend + Atlas, P3 frontend, P1 TURN + final check |
| Demo script for each review | Person 1, with one section per person |

---

## 6. Rules everyone follows

- A real commit to **your own branch every day**, between 6 AM and 11:30 PM. The dashboard's MID check needs commits on 10 different days in Weeks 1–2 (Week 2 ends 24 Oct); FINAL needs commits on 20 different days since the repo started.
- Commit code and your log together. Don't start next week's tasks early: the work is spread on purpose.
- Only Person 1 adds npm packages.
- Never merge anything into `main`. Pull requests go only into `dev`.
- Never click GitHub's "Update branch", "Resolve conflicts" or "Delete branch" buttons.
- Post the daily check-in in the group: what I committed, what's blocking me.

---

## 7. Workload, honestly

Person 1 carries the most: the hardest module, plus integration, reviews and team-lead duties. To stop him becoming the bottleneck:

- deployment is split across three people,
- Person 2 owns the speed proof for the mid review,
- everyone writes their own report and PPT sections,
- fixes go back to owners as tested patches.

If the team falls behind, the first thing to cut is the stage feature. Redis stays, because it's in Infotact's spec.
