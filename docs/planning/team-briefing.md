# ProxiSpeak — Team Briefing

*Version 2, updated 18 Oct 2026. Combines Part 1 (12 Oct) and Part 2 (13 Oct) into one document. If an older copy disagrees with this one, this one wins.*

## What we are building

ProxiSpeak is a virtual office in the browser where you hear people louder as you walk closer to them, just like in a real office.

**The problem.** On Zoom or Google Meet, everyone sits in one room and only one person can talk at a time. You can't overhear a nearby conversation and walk over to join it.

**What a user sees and does:**

1. Log in and appear at a starting spot (the *spawn point*) on a top-down 2D office map, like an old Pokémon game.
2. Walk around with the arrow keys. Everyone else's characters (*avatars*) move around too.
3. Walk near someone and you start hearing them. Closer means louder. If they stand to your left, you hear them more in your left ear.
4. Walk away and their voice fades out, then the connection closes.
5. Walls block sound. Meeting rooms keep conversations private, focus rooms are silent, and a stage lets one person speak to a whole hall.

**Real product it resembles:** [Gather](https://gather.town). We copy the idea, not its art. Characters and furniture come from free assets such as [Kenney.nl](https://kenney.nl), because Infotact requires original, plagiarism-free work.

**Targets Infotact will check:**

| Target | Number |
| --- | --- |
| Users in one office at the same time | 50+ |
| "Earshot" distance (how close you must be to hear someone) | 100 pixels |
| Time for the server to work out who is near whom | under 20 milliseconds |
| Animation smoothness | steady 60 frames per second |

## How it works, step by step

The app does six jobs, one after another. Each job is one part of the system. In this doc, an arrow like **A → server → B** always means: A sends a message to the server, and the server passes it on to B.

```
Browser A ── position, offer ──────▶  Node server  ── offer, ICE ──────▶ Browser B
Browser A ◀── near list, answer ────  Node server  ◀── answer, ICE ───── Browser B
                                           │
                                        MongoDB
                                           │
                                     Redis (Week 3)

Browser A ◀═════════ voice, directly browser to browser (WebRTC) ═════════▶ Browser B
```

Positions, the "who's near" list and the signaling notes all go through the server. The voice itself never does: it travels straight between the two browsers.

### Step 1: Moving around (the 2D world)

- The screen is a **canvas**, a blank drawing area in the web page. Our code draws the map and avatars on it.
- The code redraws the whole canvas about **60 times every second**. Each redraw is called a **frame**, so this is **60 FPS** (frames per second). Below about 30 FPS, movement looks choppy.
- The code that redraws again and again is the **game loop**. It uses `requestAnimationFrame`, a browser function that means "run my draw code right before the screen refreshes".
- When you press an arrow key, your avatar's position (its **x, y** numbers) changes, and the next frame draws it in the new spot.
- Your position is sent to the server only **about 10 times per second**, not 60. Limiting how often something happens is called **throttling**. With 50 users, 60 updates each per second would be 3,000 messages per second for the server; at 10 per second it's 500.
- Ten updates a second would make other people's avatars jump. So your browser **interpolates**: it slides their avatar smoothly between the last two positions it received.

### Step 2: Who is near whom (proximity)

- Your browser → server: "I'm now at x = 340, y = 210."
- The server writes that into a list it keeps in its own memory (fast, no database). **Four times a second**, it saves everyone who moved into the **MongoDB** database in one batch, then asks MongoDB for each of them: "who is near this user?" This uses a MongoDB query called **`$near`**.
- A **2d index** makes that question fast. An index works like the index at the back of a book: instead of checking every user, the database jumps straight to the nearby ones. This is how we stay under 20 ms.
- The server compares the answer with last time and tells your browser two lists: **entered range** (people who just came close) and **left range** (people who just walked away).

**Connect at 100 px, disconnect at 140 px.** Imagine someone standing right at the edge: 99 px, 101 px, 99 px, 101 px. With a single 100 px line, their connection would open and close several times a second. So a connection opens when someone comes within 100 px, but only closes when they move beyond 140 px. Small wobbles change nothing. You still hear nobody beyond 100 px, because the volume is zero there; the connection just stays open in case they step back. (This idea came from Anjali's document.)

**Why MongoDB and not a list in server memory?** Anjali's document suggested finding nearby people with a grid kept in the server's memory. That works, but Infotact's spec names MongoDB `$near` as the geospatial engine, and the mid review "Spatial Audit" checks exactly that. So we keep `$near`. The 2d index is itself a kind of grid, so the idea is the same. If time allows in Week 4, the geo owner can build the memory grid too and compare the two speeds.

### Step 3: Connecting the audio (signaling)

Two browsers can send audio **directly to each other** without the server in the middle. This is **WebRTC**, a technology built into every modern browser. A direct browser-to-browser connection is called **peer-to-peer** (P2P).

But the two browsers don't yet know how to reach each other. So they first pass a few messages through our server, like two people passing notes through a friend. This note-passing is called **signaling**. The server only carries the notes. It never hears the audio.

The notes, in order:

1. **Offer:** A → server → B. A says: "I want to send you audio. Here are the audio formats I support."
2. **Answer:** B → server → A. B replies: "Okay. Here are the formats I support too."
3. **ICE candidates:** A ↔ server ↔ B (both directions, several messages). Each says: "here is a network address where you might be able to reach me." The browsers try them until one works.
4. **Audio flows:** A ⇄ B directly. The server is no longer involved.

Two helper servers make step 3 work across the internet:

- **STUN server:** answers one question, "what is my public internet address?" Your laptop only knows its home Wi-Fi address, which nobody outside can reach. Google runs free STUN servers.
- **TURN server:** a relay. Some routers and firewalls block direct connections (common on college Wi-Fi or between different internet providers). Then the audio goes A → TURN → B instead. We will need one when teammates test from different homes.

When two people walk out of range, the server tells both browsers, and they close the connection.

### Step 4: Spatial audio (the mixer)

Each person's voice arrives in your browser as an audio **stream**. The **Web Audio API**, the browser's built-in sound toolkit, passes it through two "knobs" before it reaches your speakers:

**voice stream → volume knob → left/right knob → your speakers**

- The volume knob is a **GainNode**. **Gain** is just the audio word for volume.
- The left/right knob is a **StereoPannerNode**. **Panning** means shifting sound between the left and right ear.
- Every frame, your browser measures the distance and direction to each nearby person and turns the knobs. Example: someone 20 px away plays at high volume; someone 90 px away is faint; someone to your right sounds mostly in your right ear.
- Sound getting quieter with distance is called **attenuation**.

### Step 5: Walls and zones

**Walls.** Imagine a straight line between you and the other person. If that line crosses a wall on the map, their volume is turned down, like hearing someone through a wall.

**Zones.** A **zone** is a marked area of the map, and its type decides who can hear whom. Zones are rectangles drawn in the map file, so moving a meeting room needs no code change. (This idea came from Anjali's document.)

| Zone | Where | Who hears whom | When we build it |
|---|---|---|---|
| Open proximity | Desks, lounge | Anyone within 100 px; quieter with distance | Weeks 1–2 (this is the base app) |
| Lobby | Entrance | Same as open; it's where new users appear | Week 1 (it's just the spawn point) |
| Private | Meeting room, phone booth | Only people inside the same room, at full volume. Nobody outside hears in; nobody inside hears out | Week 3 |
| Silent | Focus room | Nobody. Everyone inside is muted | Week 3 |
| Stage | Stage hall | The person on stage is heard by the audience at full volume | Week 4 |

**Why in stages:** the mid review only checks open proximity (the under-20 ms check and two browsers talking), so zones come in Weeks 3–4. They also give us a real use for **`$geoWithin`**, a MongoDB query the spec names, which means "find every user inside this rectangle".

### Step 6: Handling many users (scaling)

**Many users on one office.** One Node server can only handle so many users. To handle more, we run several copies of the server. Problem: a user connected to copy 1 can't see messages from a user on copy 2. Fix: **Redis Pub/Sub**. Every server copy posts its messages to Redis, and every copy listens to Redis. It works like a shared WhatsApp group between the servers. Socket.io has a ready-made plug-in for this called the **Redis adapter**.

**Many people in one group.** Five people stand together, all talking. In our design every person connects directly to every other person. This is called a **mesh**. Each person has 4 connections and sends their voice 4 times, once per connection. A voice uses about **40 kbps** per connection. (**kbps** = kilobits per second, how much data flows each second. A normal home connection can upload several thousand kbps.)

| People in the group | Connections per person | Connections in total | Upload per person |
|---|---|---|---|
| 4 | 3 | 6 | ~120 kbps |
| 6 | 5 | 15 | ~200 kbps |
| 8 | 7 | 28 | ~280 kbps |
| 10 | 9 | 45 | ~360 kbps |
| 50 (one speaker on stage, everyone listening) | 49 for the speaker | 49 | ~2,000 kbps for the speaker |

Apps like WorkAdventure switch to a different design at about 4 people because they also send **video**, which needs 25–60 times more data than voice. **We send audio only**, so a mesh stays comfortable up to about 8 people in one group. Our plan:

1. **Weeks 1–2:** plain mesh, tested with 3–4 browsers. Enough for the mid review.
2. **Week 3** (the spec's "optimize the WebRTC mesh" task): each person connects to at most their **8 nearest** people, and we lower the voice data rate a little.
3. **Week 4, stage:** listeners only **receive** audio, so they send nothing. The speaker's upload still grows with every listener, which is why the stage covers the stage hall (about 15–20 people), not the whole office.
4. **Stretch goal only:** an **SFU** (Selective Forwarding Unit) is a server that receives each voice once and forwards it to everyone, so a speaker uploads only once. It's the real industry answer for big rooms, but it's a whole extra server to build and host, our free hosting can't run it easily, and the spec doesn't ask for it.

## Tech stack, from zero

Everything is written in **JavaScript**. The **frontend** is the part that runs in the user's browser; the **backend** is the part that runs on our server.

| Tool | What it is | Its job in ProxiSpeak |
| --- | --- | --- |
| **React** | A JavaScript library for building web pages out of reusable pieces called *components* | Login screen, sidebar, the page that holds the canvas |
| **Vite** | A tool that starts a local development server and bundles the frontend for deployment | `npm run dev` opens the app at localhost in seconds |
| **HTML5 Canvas** | A drawing area in a web page that code can paint pixels on | Draws the office map and the walking avatars, 60 times a second |
| **Tiled** | A free desktop app for designing tile-based game maps; it exports the map as a JSON file | We design the office layout in Tiled; the canvas draws whatever JSON it loads |
| **WebRTC** | Browser technology for sending audio and video directly between two browsers | Carries each person's voice to the people near them |
| **getUserMedia** | The browser function that asks permission and turns on the microphone | Captures your voice so WebRTC can send it |
| **Web Audio API** | The browser's built-in sound toolkit | Changes volume and left/right balance based on distance |
| **Node.js** | Lets JavaScript run on a server instead of only in a browser | Runs our backend |
| **Express** | A small Node library for handling normal web requests (URLs, APIs) | Login, loading and saving maps |
| **Socket.io** | A library for keeping a connection open between browser and server so either side can send messages anytime (built on *WebSockets*) | Sends positions, "entered/left range" lists, and signaling notes |
| **MongoDB** (on **Atlas**) | A database that stores data as JSON-like documents. Atlas is MongoDB's cloud hosting, with a free tier | Stores users, positions, zones, saved office maps; answers "who is near?" with `$near` |
| **Redis** | A very fast database that keeps data in memory (RAM); also works as a message board between programs (*Pub/Sub*) | Lets several copies of our server share messages, so 50+ users work (Week 3) |
| **HTTPS** | The secure version of a website address (the padlock in the browser) | Browsers only allow microphone access on HTTPS sites or on localhost, so our deployed app must use it |
| **Git and GitHub** | Git tracks every change to code; GitHub stores the code online | Our shared repo; each of us works on our own branch |

**Redis in plain words.** MongoDB saves data on disk and is built to keep things forever. Redis keeps data in memory, so it is much faster, and it is good at passing messages between programs. We only need it in Week 3, when we run more than one copy of our server. Until then, ignore it.

## Glossary

| Term | Plain meaning |
| --- | --- |
| Frame | One redraw of the canvas |
| FPS | Frames per second. We aim for at least 60 |
| Game loop | Code that updates and redraws the screen again and again |
| Throttling | Limiting how often something runs, e.g. send position only 10 times a second |
| Interpolation | Sliding an avatar smoothly between two known positions so it doesn't jump |
| Latency | Delay between something happening and others seeing or hearing it |
| Spawn point | Where your avatar appears when you log in |
| Tile / tilemap | The map is a grid of small square images (tiles); the full grid is a tilemap |
| Collision layer | The part of the map marking tiles you can't walk through (walls, desks) |
| Zone | A marked area of the map, like a meeting room, with its own hearing rules |
| Connect/disconnect gap | Connect at 100 px, disconnect only beyond 140 px, so connections don't flicker at the edge |
| Mode | How a voice is played: `falloff` = quieter with distance, `full` = full volume (inside a private room) |
| WebSocket | A connection between browser and server that stays open, so messages flow both ways anytime |
| Event | A named message sent over Socket.io, e.g. `player:move` |
| Payload | The data inside an event, e.g. `{ x: 340, y: 210 }` |
| Peer-to-peer (P2P) | Two browsers talking directly, without a server in between |
| Signaling | Passing setup messages between two browsers through the server before P2P starts |
| Offer / answer | The first two signaling messages: "here's what I support" / "okay, here's mine" |
| ICE candidate | A possible network address where a browser can be reached |
| STUN | A free helper server that tells your browser its public internet address |
| TURN | A relay server that passes audio along when a direct connection is blocked |
| Mesh | Every nearby person connected directly to every other nearby person |
| kbps | Kilobits per second: how much data flows each second. One voice needs about 40 |
| SFU | A media server that receives each voice once and forwards it to everyone (stretch goal only) |
| Gain | Volume |
| Panning | Moving sound between the left and right ear |
| Attenuation | Sound getting quieter with distance or through walls |
| Index (database) | A shortcut the database keeps so it can find data without checking every record |
| `$near` | A MongoDB query: "find documents near this x, y point" |
| `$geoWithin` | A MongoDB query: "find documents inside this shape", e.g. a meeting-room rectangle |
| Pub/Sub | Publish/subscribe: programs post messages to a channel, and every listener receives them |
| Contract | Our agreed list of event names and data shapes that every module must use |
| Lab page | A test page for one module, e.g. `localhost:5173/?lab=world` |
| Branch | Your own copy of the code inside the repo, where your commits go |
| Commit | A saved snapshot of your changes, with a message describing them |
| Merge | Combining the changes from one branch into another |
| Merge conflict | Two people changed the same lines; Git can't decide which to keep, so a human must |
| Pull request (PR) | A GitHub page that asks "please merge my branch into this other branch" and shows the changes |
| Patch file | A file containing an exact code change, which you apply with `git apply` |
| `dev` branch | Our shared testing branch where everyone's work is combined. Code only goes into it, never back out |

## The four modules and who owns what

Each of us owns one module and its folders.

| Module | Owner | Folders | Weeks 1–2 | Mid review demo | Weeks 3–4 |
| --- | --- | --- | --- | --- | --- |
| 1. Signaling + WebRTC connection | Aryan | `server/index.js`, `server/signaling/`, `client/src/net/`, `client/src/rtc/`, `client/src/App.jsx`, `shared/` | Socket.io server; receive and broadcast positions; the browser's connection to the server; relay offer, answer and ICE notes; turn on the mic and connect two browsers | Two browsers talking through our signaling server | Redis adapter so several server copies work together; nearest-8 limit; stage connections; TURN server; deployment check |
| 2. Geospatial engine | Pratik | `server/geo/` | MongoDB setup; position schema with a 2d index; `$near` query; the 100/140 px connect/disconnect rule | A test script with 50 fake users proving the proximity check takes under 20 ms | Zones with `$geoWithin` and their hearing rules; saving office maps and walls in MongoDB; deploy the backend and database |
| 3. 2D world (canvas) | Anjali | `client/src/world/`, `client/public/maps/`, `client/public/assets/` | React canvas; game loop at 60 FPS; load the Tiled map; avatar movement with walls; send position 10 times a second; draw other avatars smoothly | Several avatars walking smoothly around the office | Zone areas on the map; wall line-of-sight check for the audio; 60 FPS polish; deploy the frontend |
| 4. Spatial audio mixer | Koushik | `client/src/audio/`, `client/public/sounds/` | Volume and left/right pipeline tested on sample sounds; distance → volume and direction → panning formulas; mic level bar and mute button | Sound that gets louder and shifts ears as a fake avatar moves around you | Real WebRTC voices in the mixer; walls muffle voices; private-room full volume; stereo polish |

**Why it's split this way.** Signaling and the WebRTC connection are tightly linked and the hardest part to debug, so one person owns both. Module 1 also owns the "glue" files (`server/index.js` starts the server; `App.jsx` connects the four modules on the page), because it's the only module that talks to all three others.

**Nobody waits for anybody.** Every module has a fake stand-in for the modules it depends on, so it can be built and tested alone.

| Module | Needs data from | Fake stand-in until the real thing arrives | Real thing plugged in |
|---|---|---|---|
| 1. Signaling + WebRTC | Geo engine (who is near) | A simple distance check in server memory | Thu 22 Oct |
| 2. Geospatial engine | Nobody | Test scripts with fake users in a local MongoDB | — |
| 3. 2D world | Server (other players) | `fakeNet.js`: bots that wander around | Sun 18 Oct |
| 4. Spatial audio | Voices (WebRTC) and positions (world) | Sample sound files and a fake avatar you drag around | Week 3 |

**Lab pages.** Each module has a test page you can open on its own: `localhost:5173/?lab=world`, `?lab=audio` or `?lab=rtc`.

**Your brief.** Each module has a brief in `docs/briefs/` with a plain-English explanation, a glossary, numbered tasks, and a **calendar** saying which task to do on which day. From Week 2, you also explain your module in your own words in `docs/<module>.md`.

**Viva:** each person must explain their own module in detail, and the overall flow in this doc at a high level.

## How we work as a team

We work like a small real dev team: four people (and their AI tools) each build one part, and shared files in the repo make sure the parts fit together.

### The one idea that makes this work: contracts

If the canvas code sends `'playerMoved'` and the server listens for `'player:move'`, nothing connects and no error appears. To stop this, every name is defined **once** in a shared file, and everyone imports it:

```js
// shared/events.js — the ONLY place event names live
export const EVENTS = {
  MOVE: 'player:move',          // browser → server   { x, y, dir }
  PEERS_UPDATE: 'peers:update', // server → browser   { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }
  SIGNAL: 'rtc:signal',         // browser → server → browser: sent { to, data }, delivered { from, data }
};
```

Now both sides write `EVENTS.MOVE`. A typo like `EVENTS.MOVEE` breaks loudly instead of silently.

`PEERS_UPDATE` already carries a `mode` for each person, so adding zones later won't need a contract change. In Weeks 1–2, `mode` is always `'falloff'` and `changed` is always empty.

### Shared files in the repo

| File | What it's for | Who edits it |
| --- | --- | --- |
| `AGENTS.md` | Rules for every person and AI tool: which folder is yours, read the contracts first, never edit other folders | Aryan |
| `CLAUDE.md` | Points Claude Code to `AGENTS.md` | Aryan |
| `CONTRACTS.md` | Every event, data shape, database schema and function that modules share | Aryan (ask him for changes) |
| `shared/events.js` | Event names in code | Aryan (ask him for changes) |
| `docs/briefs/` | One brief per module, with your tasks and calendar | Aryan |
| `docs/ai-session-prompt.md` | The prompt you paste at the start of every AI session | Aryan |
| `docs/logs/<your-name>.md` | Your daily log: what you built, how it works, problems you hit. These become your viva notes | You only |

**Two more small rules:**

- **Only Aryan adds npm packages.** If two people install different packages, `package-lock.json` (the file that records exact package versions) conflicts on every merge. The starter files already include every package we need for Weeks 1–2. Need another one? Ask in the group.
- **GitHub templates** are included: a pull request template (what you added, how to test it) and an issue template for fix patches.

### Our branches

- One branch per person, named after you (lowercase first name). Push **only** to your own branch.
- **Nobody merges into `main` until after the final review.** This is an Infotact rule.
- Your branch already exists on GitHub: Aryan created it from `main`. After Aryan puts the starter files (folders and shared files) on `main` in one commit, you **merge `main` into your branch once**, so it has them. After that, nobody touches `main`.
- To test the full app, each person opens a **pull request** from their branch into the shared `dev` branch. Aryan reviews and merges it. Code only goes **into** `dev`, never back into personal branches.
- Never click GitHub's **"Update branch"**, **"Resolve conflicts"** or **"Delete branch"** buttons on these pull requests. The first two pull everyone else's code into your branch; the third deletes the branch the Infotact dashboard is tracking.

### Your daily routine

1. Check your brief's **calendar** for today's task.
2. Open your AI tool and start with the prompt in `docs/ai-session-prompt.md`. Claude Code, Cursor and Copilot read `AGENTS.md` and `CONTRACTS.md` from the repo; for ChatGPT, paste them in.
3. Build today's task in **your own folder** and test it with fake data.
4. Ask the AI to explain what it wrote until you understand it.
5. Write 3–5 lines about it in your log, in your own words.
6. Commit the code and the log together, then push to your branch. Type the commit message yourself.
7. Post in the team group: what I committed today, and what's blocking me.

### When something breaks

Twice a week, on **Wednesday and Saturday**, Aryan combines everyone's work on `dev` and runs the full app. Open your pull request into `dev` by the morning of each integration day.

| Date | What happens |
|---|---|
| Sat 17 Oct | Setup check: everyone's branch exists and their work runs on their own laptop |
| Wed 21 Oct | First integration |
| Sat 24 Oct | Second integration and **mid freeze**: after this, only fixes until the mid review |

If your part breaks something, Aryan fixes it locally until it works, then sends you the tested fix as a **patch file** in a GitHub Issue: what broke, why, and the exact change. **You** apply it on your own branch (`git apply <file>`), ask your AI to explain it, and commit it, so the credit and the learning stay with you.

Need a contract changed? Ask Aryan. He updates the shared files and tells everyone in the group.

## Rules that affect our marks

The most important rule: **everyone commits real work to their own branch every day until the final review.**

| Event | Date |
| --- | --- |
| Project start | 10 Oct 2026 |
| Mid review (checks Weeks 1–2) | 27–30 Oct 2026 |
| Final review (checks Weeks 3–4) | about 8–13 Nov 2026 (not announced yet) |

These rules come from the Infotact dashboard (Project Progress tab):

- **Mid review:** commits on **10 different days in Weeks 1–2**, counted from the day the repo was created (Week 1 = 10–17 Oct, Week 2 = 17–24 Oct). You also need a Week 1 and a Week 2 write-up on the dashboard, and ProxiSpeak selected as your project.
- **Final review:** commits on **20 different days** since the repo started, plus Week 1–4 write-ups and the selected project.
- Week 2 ends on 24 Oct, so **commit every single day**. Commit between 6 AM and 11:30 PM: a commit just after midnight may count for the previous day.
- **Not counted:** empty commits, one-character changes, the same commit repeated, junk commits, and commits on someone else's branch.
- **Counted:** code, documentation, README changes, config files, images and other assets.
- Pair your daily log with real code. Log-only days, again and again, can look like gaming the system.

**Scoring (70 marks; at least 45 needed for stipend, 53 is the expected level):** project evaluation 20 + 20, technical viva 5 + 5, attendance at reviews 5 + 5, social media video 5 + 5. Attendance and the videos are 20 easy marks.

**Training sessions:** Monday to Friday, link shared before 3 PM. Join with your **registered email** and stay **at least 30 minutes**.

## Deployment and cost

We can build, test and deploy the whole project for **₹0** using free tiers. **Deploying** means putting the app on the internet so anyone can open it with a link. Infotact checks a working deployed demo at the final review.

| Piece | Where | Free? | The catch |
| --- | --- | --- | --- |
| Frontend (React) | Render Static Site | Yes | None for us |
| Backend (Node + Socket.io) | Render free Web Service | Yes | Sleeps after 15 minutes with no traffic and takes a while to wake up. Open it a few minutes before any review |
| Database | MongoDB Atlas free cluster | Yes, forever | 512 MB storage and about **100 operations per second** |
| Redis (Week 3) | Own laptops; Upstash or Render for the deployed version | Yes | Upstash free allows 500,000 commands a month: fine for demos, not long load tests |
| STUN server | Google's public servers | Yes | None |
| TURN server | Open Relay by Metered | Yes | 20 GB of relayed traffic a month, enough for testing and demos |
| HTTPS | Included with Render | Yes | None |

- The geospatial owner runs the **50-user speed test on a local MongoDB** (installed on a laptop, free, no limit).
- The real app keeps everyone's live position in the server's memory and shows avatars from there. Only 4 times a second does it save the people who moved to MongoDB and check who is near.
- **Who deploys (Week 4):** the geo owner deploys the backend and the database, the world owner deploys the frontend, and Aryan sets up TURN and does the final check.

Prices checked on 12 Oct 2026; free tiers can change.

## Still to decide

1. Stage reach: the stage hall (recommended, because the speaker's upload grows with every listener) or the whole office.
2. Daily check-in time in the group.
3. Integration time on Wednesdays and Saturdays.
4. Social media videos: proposal is the world owner for the mid review and the audio owner for the final review.

## What happens next

1. **Setup, part 1 (everyone):** accept the GitHub invite, check your GitHub email settings, set `git config --global user.name` and `user.email`, and clone the repo.
2. **Aryan** puts the starter files on `main` and messages the group.
3. **Setup, part 2 (everyone):** switch to your branch, merge `main` into it once, select ProxiSpeak as your project on the dashboard, then make your first commit: your log file plus your first task from the calendar.
4. **Every day:** a real commit on your own branch, plus the Week 1 and Week 2 write-ups on the dashboard.
5. **Wed 21 Oct:** first integration. **Sat 24 Oct:** mid freeze.
6. **By 20 Oct:** Aryan submits the Work Distribution Document.
