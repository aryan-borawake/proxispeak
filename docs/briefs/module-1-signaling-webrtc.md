# Module 1 — Signaling + WebRTC Connection

**For: Person 1 (team lead).** Owner: ________

> **How to read this brief.** Sections 1–5 explain your module. Section 6 is your plan: read each task on the day the calendar gives it, not all at once. The appendix at the end is written for your AI tool, so you can skip it.

---

## 1. What this module does

Think of your module as the app's post office. It carries every message between browsers, but it never listens to the voice calls.

**Example.** Riya and Sam open ProxiSpeak.

1. Riya's browser connects to our server and says "I'm Riya, I'm joining." The server replies: "You start here, and these people are already in the office."
2. Riya walks. About 10 times a second, her browser tells the server: "I'm now at x = 340, y = 210."
3. The server keeps everyone's position in its memory. 10 times a second, it sends the full list to every browser, so everyone sees everyone move.
4. Four times a second, the server asks Person 2's code "who is near whom?" and tells each browser what changed: "Sam just came close" or "Sam just walked away."
5. When Sam comes close, the two browsers pass a few setup notes through the server. This is **signaling**. After that, their voices travel directly from one browser to the other. The server never hears them.

Your module has two halves:

- **Server half:** steps 1–4, plus passing the notes in step 5. It runs on our Node server.
- **Browser half:** each browser's connection to the server, the microphone, and the direct voice connection. It runs in every user's browser.

---

## 2. Where your module fits

1. Person 3's world code sends your position through **your** browser connection to **your** server.
2. Your server asks **Person 2's** geo engine who is near whom.
3. Your server tells **your** WebRTC code whom to connect to.
4. Voices arrive in the browser, and you hand them to **Person 4's** mixer, which sets their volume.

You are the only module that talks to all three others. That's why you also own `App.jsx`, the file that plugs the modules together on the page.

---

## 3. Your folders

| Folder or file | What goes in it |
|---|---|
| `server/index.js` | The file that starts the server |
| `server/signaling/` | The server half: the list of players, message handling, the 4-times-a-second check, note passing |
| `server/scripts/` | The 50-bot load test (Week 3) |
| `client/src/net/` | The browser's connection to the server. Every module uses it |
| `client/src/rtc/` | The microphone and the direct voice connections, plus your test page |
| `client/src/App.jsx`, `client/src/main.jsx` | The page that plugs the four modules together |
| `shared/`, `AGENTS.md`, `CONTRACTS.md`, `README.md`, package files, `.github/` | Shared files only you edit |

**Not yours:** `server/geo/`, `client/src/world/`, `client/src/audio/`. If they break during integration, you fix them locally and send the owner a patch (see the Team Briefing, "When something breaks").

---

## 4. Words you need

| Word | Plain meaning |
|---|---|
| Server | A program that runs all the time and answers browsers. Ours is written in Node.js |
| Express | A Node library for normal web addresses, like `/api/health` |
| Health check (`/api/health`) | An address that just answers `{ ok: true }`, so you can check the server is running |
| Socket.io | A library that keeps a connection open between browser and server, so either side can send a message any time |
| Event | A named message, e.g. `player:move` |
| Payload | The data inside an event, e.g. `{ x: 340, y: 210 }` |
| Handler | The function that runs when a certain event arrives |
| Broadcast | Send the same message to many browsers at once |
| Socket.io room | A named group of connections. `io.to('office-1')` sends to everyone in that group |
| `Map` | A JavaScript object that stores pairs, like "user id → position" |
| Port | A numbered door on a computer. Our server uses 3001; the browser app uses 5173 |
| CORS | A browser safety rule: a page on one port can't talk to a server on another port unless the server allows it. Our server allows 5173 |
| Validate | Check that incoming data makes sense (real numbers, inside the map) before using it |
| Throttling | Limiting how often something runs |
| Tick | A job that repeats on a timer. Our proximity tick runs every 250 ms (4 times a second) |
| Peer | Another person you have a direct voice connection with |
| Peer set | The list of people you're currently connected to |
| Symmetric | If Sam is in Riya's peer set, Riya must be in Sam's |
| Signaling | Passing setup notes between two browsers through the server before the voice connection starts |
| Offer / answer | The first two notes: "I want to send you audio, here are the formats I support" / "okay, here are mine" |
| SDP | The text inside an offer or answer listing audio formats. You never read it; you just pass it along |
| ICE candidate | A note saying "here's a network address where you might reach me" |
| Queue | A waiting list. Notes that arrive too early wait in a queue until the browser is ready for them |
| STUN | A free helper server that tells your browser its public internet address. We use Google's |
| TURN | A relay server that passes audio along when a direct connection is blocked |
| `getUserMedia` | The browser function that asks permission and turns on the microphone |
| MediaStream | Live audio, such as your microphone or a voice arriving from another browser |
| `RTCPeerConnection` | The browser object for one direct connection to one other person. You make one per nearby person |
| Glare | Both browsers send an offer at the same moment and the setup breaks. Our rule: only the person with the smaller id sends the offer |
| Callback | A function you hand to someone else's code so it can call you later, e.g. "call this when a voice arrives" |
| Unsubscribe function | A function that stops a callback from being called any more |
| Promise | A JavaScript value that arrives later, like the server's reply. You wait for it with `await` |
| `.env` | A local file holding secrets like passwords. It is never committed |
| Lab page | A test page for one module, opened by adding `?lab=rtc` to the address |
| Mesh | Every nearby person connected directly to every other nearby person |
| Data rate (kbps) | How much data a connection sends each second, in kilobits. A voice needs about 40 kbps |
| `chrome://webrtc-internals` | A built-in Chrome page that shows the stats of every voice connection |
| Redis | A very fast in-memory database that can also pass messages between programs |
| Redis adapter | A Socket.io plug-in that lets two copies of our server share messages through Redis |
| Load test | A script that pretends to be many users at once, to see whether the server copes |
| Bot | A fake user controlled by a script |
| Receive-only connection | A voice connection where you only listen and send nothing (used for the stage) |
| Deploy | Put the app on the internet so anyone can open it with a link |

---

## 5. Working alone

You never have to wait for a teammate:

- **Two browser tabs** side by side are your two "users".
- **A fake "who is near" check** until Person 2's engine is plugged in (Thu 22 Oct): a small file, `fakeNearby.js`, that measures distances itself with `Math.hypot` (a JavaScript function that gives the straight-line distance between two points). It answers in the same format as Person 2's engine, so swapping it later is a one-line change.
- **No mixer yet:** until Week 3, play incoming voices through a plain `<audio>` tag on your test page.

---

## 6. Your two weeks

**Commit messages.** The word before the colon says what kind of change it is: `feat` = new feature, `fix` = bug fix, `docs` = documentation, `test` = test, `perf` = speed improvement, `chore` = setup work. The word in brackets is your module. Example: `feat(signaling): join flow`.

**Integration days** (Wed 21 and Sat 24 Oct): open your pull request into `dev` in the morning. As lead, you also merge everyone's pull requests and run the full app. Sat 17 Oct is a setup check: everyone's branch exists and their work runs.

### Calendar

Tasks are numbered. This calendar says which day to do each one. If the plan slips again, only this table changes.

| Date | Do these tasks | Notes |
|---|---|---|
| Thu 15 Oct | — | Commit the prototype |
| Fri 16 Oct | 1 | Skeleton on `main`; create `dev` |
| Sat 17 Oct | 2, 3 | Setup check: everyone's branch exists and their work runs |
| Sun 18 Oct | 4 | Tell Person 3 that `net` is ready |
| Mon 19 Oct | 6 |  |
| Tue 20 Oct | 7 | Explain the pull request rules to the team |
| Wed 21 Oct | 8 | **Integration #1:** merge pull requests into `dev`, run, send patches |
| Thu 22 Oct | 9 | Plug in Person 2's engine |
| Fri 23 Oct | 10 |  |
| Sat 24 Oct | 11, 12 | **Integration #2 + mid freeze** |
| Sun 25 Oct | 5, 13 |  |
| Mon 26 Oct | 14 |  |

### Task by task

**Task 1: skeleton and log.**
- Build: run the skeleton prompt in Claude Code, check the result, and put it on `main` in one direct commit. Create the `dev` branch from `main`. Merge `main` into `aryan` once. Create `docs/logs/aryan.md`.
- Why: everyone needs the shared files before writing any code.
- Done when: teammates can create their branches from `main`, starting with the skeleton.
- Commit: `chore: add project skeleton and shared contracts`

**Task 2: the server starts; people can join.**
- Build: the server starts and answers `/api/health`. A `Map` in `players.js` holds every player. When a browser sends `player:join`, the server adds the player, replies with `world:init` (your start point and the people already here), and tells everyone else with `player:joined`.
- Why: nothing else can happen until people can join.
- Done when: two tabs join and the server log shows both.
- Commit: `feat(signaling): join flow with in-memory player store`

**Task 3: positions in, positions out.**
- Build: when `player:move` arrives, validate it, then update that player in the `Map`. Every 100 ms, send everyone's positions to all browsers with `players:state`. When a tab closes, remove the player and send `player:left`.
- Why: this is the spec's Week 1 backend task, "broadcasting avatar X/Y".
- Done when: positions from one tab appear in the console of the other tab.
- Commit: `feat(signaling): position broadcast 10x/sec`

**Task 4: the browser connection.**
- Build: `client/src/net/`, with functions to join, send my position, and listen for other players. A small list on your test page shows who is online. Tell Person 3 it's ready.
- Why: Person 3's world needs a way to send positions and receive everyone else's.
- Done when: two tabs show each other in the list.
- Commit: `feat(net): browser socket client`

**Task 5: write down how your server works.**
- Build: write `docs/signaling.md` version 1, explaining join, move and broadcast in your own words.
- Commit: `docs: signaling flow v1`

**Task 6: the "who is near" check.**
- Build: `tick.js` runs every 250 ms. For each person who moved, it asks `fakeNearby.js` who is close, compares the answer with that person's peer set, and sends `peers:update` ("these people came close, these walked away") to both people in each pair.
- Why: this decides who gets a voice connection.
- Done when: walking two tabs together prints "entered"; walking them apart prints "left".
- Commit: `feat(signaling): proximity tick with fake nearby`

**Task 7: microphone.**
- Build: `getMicStream()` asks for the microphone. If the user says no, or there is no microphone, show a clear message. Add a mic test button on your test page.
- Why: no microphone, no voice.
- Done when: the browser asks for permission and the button shows the mic is live.
- Commit: `feat(rtc): microphone access`

**Task 8: note passing and the offer.**
- Build: the server passes `rtc:signal` notes from one browser to another. It checks that the receiver exists and writes the sender's id itself, never trusting what the browser claims. In the browser, when someone enters range, create a connection; the person with the smaller id sends the offer.
- Why: this is the first step of signaling.
- Done when: the offer shows up in the other tab's console.
- Commit: `feat(rtc): offer flow`

**Task 9: plug in Person 2's engine; answers and ICE.**
- Build: replace `fakeNearby.js` with Person 2's real engine. Then handle the answer and the ICE candidates, and add Google's STUN server.
- Done when: the connection's state reaches "connected".
- Commit: `feat(rtc): answer and ICE handling`

**Task 10: two browsers hear each other.**
- Build: play the incoming voice in an `<audio>` tag. When someone leaves range or closes their tab, close and clean up that connection.
- Why: this is the mid review "Audio Check".
- Done when: you speak in one tab (wearing headphones) and hear it in the other.
- Commit: `feat(rtc): two-way audio between peers`

**Task 11: the awkward cases.**
- Build: put ICE candidates that arrive too early in a queue; handle someone leaving halfway through the setup; handle a page refresh. Read the TURN settings from `.env`.
- Why: these are the bugs that show up during demos.
- Done when: refreshing a tab reconnects cleanly.
- Commit: `fix(rtc): handshake edge cases`

**Task 12: mid freeze.**
- Build: everything for the mid review works together on `dev`. Check the connections in `chrome://webrtc-internals`. From now until the review, only fixes.
- Commit: `chore: mid review integration fixes`

**Task 13: mid demo script.**
- Build: write down the exact clicks for the audio demo. Add the WebRTC part to `docs/signaling.md`.
- Commit: `docs: mid demo script and signaling v2`

**Task 14: rehearsal.**
- Build: run the full demo with the team. Write viva notes in your log.
- Commit: `docs: viva notes`

---

## 7. Mid review: what you show

Two browsers (two laptops if possible, or two tabs with headphones) walk close and start talking through our server. They walk apart and the connection closes. Open `chrome://webrtc-internals` to prove the voice goes straight from browser to browser.

---

## 8. Weeks 3–4

**Week 3: handling more users**
- Run two copies of the server and connect them with Redis, so a user on copy 1 sees a user on copy 2. First, settle one design question in the Week 3 chat: positions live in each copy's memory, so the copies must share them somehow.
- Write a load test: 50 bots walking around and sending positions. Measure how long each check takes.
- Limit each person to their 8 nearest connections, and lower the voice data rate a little.

**Week 4: zones, stage, going live**
- Use Person 2's hearing rules (private rooms, silent rooms) when deciding who connects.
- Stage: listeners get receive-only connections.
- Add the TURN server to the live app, check the deployment with Persons 2 and 3, and write the final demo script.

---

## 9. Final review: what you show

The live app with real voices from different homes, the 50-bot load test running, and two server copies sharing users through Redis.

---

## 10. Viva questions, with short answers to build on

| Question | Short answer |
|---|---|
| Why doesn't the voice go through our server? | WebRTC sends it browser to browser. The server only passes the setup notes. That means less delay and less load on the server |
| What are the offer, answer and ICE candidates? | The offer and answer agree on audio formats; ICE candidates share possible network addresses |
| Why do we need STUN and TURN? | STUN tells a browser its public address. TURN relays the audio when routers block direct connections |
| Why three speeds: 60, 10 and 4 times a second? | Drawing needs 60 to look smooth; positions only need 10; "who is near" changes slowly, so 4 is enough |
| How do you stop both browsers sending an offer? | Only the person with the smaller id sends it |
| What does the Redis adapter solve? | Users on different server copies can receive each other's messages |
| How many connections does a group of 8 need? | 8 × 7 ÷ 2 = 28. Fine for voice, too much for video |
| Why does the microphone need HTTPS? | Browsers only allow `getUserMedia` on secure sites or on localhost |

---

## 11. Mistakes to avoid

- ICE candidates can arrive before the answer. Queue them, or connections fail at random.
- Never trust data from a browser. Validate every payload.
- If the browser shows a CORS error, the server isn't allowing port 5173.
- Keep peer sets symmetric, or one person hears the other but not the reverse.
- The free Render server sleeps after 15 minutes with no visitors. Open it a few minutes before any review.

---

## Appendix: for your AI tool

The exact names live in `CONTRACTS.md`. This is a summary.

```js
// client/src/net/index.js — exports `net`, used by world and rtc
net.connect({ name })            // → Promise<{ selfId, roomId, spawn, players }>
net.sendMove({ x, y, dir })      // world calls this at most 10 times a second
net.onPlayersState(cb)           // each on… returns an unsubscribe function
net.onPlayerJoined(cb)
net.onPlayerLeft(cb)
net.onPeersUpdate(cb)            // { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }
net.sendSignal({ to, data })     // delivered to the other side as { from, data }
net.onSignal(cb)

// client/src/rtc/index.js
getMicStream()                   // → Promise<MediaStream>
createRtcManager({ net, selfId, micStream, onRemoteStream, onPeerClosed, onPeerMode })
                                 // → { setMuted(bool), closeAll() }
RtcLab                           // test page component (?lab=rtc)

// server/signaling/index.js
attachSignaling(io, { geo })

// Proximity tick (every PROXIMITY_TICK_MS = 250):
// moved users → geo.upsertPositions(moved) → for each, in parallel:
// geo.findNearby(id, DISCONNECT_PX) → computePeerChanges(peerSet, nearby, { connectPx: 100, disconnectPx: 140 })
// → update BOTH users' peer sets → emit peers:update to each affected browser → clear moved flags
```
