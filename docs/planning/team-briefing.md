# ProxiSpeak — Team Briefing

> Copy of the teammate-facing briefing doc (Claude Docs, 12 Oct 2026). This is what Anjali, Kaushik and Pratik were told about the app, the modules and the workflow. It is also the benchmark explanation depth (see 06-explanation-style.md). The live doc may be edited later; if they differ, the live doc and files 04/05 win.

## What we are building

ProxiSpeak is a virtual office in the browser where you hear people louder as you walk closer to them, just like in a real office.

**The problem.** On Zoom or Google Meet, everyone sits in one room and only one person can talk at a time. You can't overhear a nearby conversation and walk over to join it.

**What a user sees and does:**

1. Log in and appear at a starting spot (the *spawn point*) on a top-down 2D office map, like an old Pokémon game.
2. Walk around with the arrow keys. Everyone else's characters (*avatars*) move around too.
3. Walk near someone and you start hearing them. Closer means louder. If they stand to your left, you hear them more in your left ear.
4. Walk away and their voice fades out, then the connection closes.
5. Walls block sound, and meeting rooms keep conversations private.

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

*[Diagram in the live doc: Browser A and Browser B on either side, the Node server in the middle with MongoDB below it and Redis (Week 3, dashed) below that. Arrows: A → server "position, offer"; server → A "near list, answer"; server → B "offer, ICE"; B → server "answer, ICE"; server ↔ MongoDB. A thick line along the bottom: "voice travels directly, browser to browser (WebRTC)".]*

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
- The server writes that into a list it keeps in its own memory (fast, no database). **Four times a second**, it saves everyone who moved into the **MongoDB** database in one batch, then asks MongoDB for each of them: "who is within 100 pixels of this user?" This uses a MongoDB query called **`$near`**.
- A **2d index** makes that question fast. An index works like the index at the back of a book: instead of checking every user, the database jumps straight to the nearby ones. This is how we stay under 20 ms.
- The server compares the answer with last time and tells your browser two lists: **entered range** (people who just came close) and **left range** (people who just walked away).

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

### Step 5: Walls block sound

Imagine a straight line between you and the other person. If that line crosses a wall on the map, their volume is turned down, like hearing someone through a wall. Meeting rooms are marked areas (*zones*) where only people inside the same room hear each other.

### Step 6: Handling many users (scaling)

- One Node server can only handle so many users. To handle more, we run several copies of the server.
- Problem: a user connected to copy 1 can't see messages from a user on copy 2.
- Fix: **Redis Pub/Sub**. Every server copy posts its messages to Redis, and every copy listens to Redis. It works like a shared WhatsApp group between the servers. Socket.io has a ready-made plug-in for this called the **Redis adapter**.

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
| **MongoDB** (on **Atlas**) | A database that stores data as JSON-like documents. Atlas is MongoDB's cloud hosting, with a free tier | Stores users, positions, saved office maps; answers "who is near?" with `$near` |
| **Redis** | A very fast database that keeps data in memory (RAM); also works as a message board between programs (*Pub/Sub*) | Lets several copies of our server share messages, so 50+ users work (Week 3) |
| **HTTPS** | The secure version of a website address (the padlock in the browser) | Browsers only allow microphone access on HTTPS sites or on localhost, so our deployed app must use it |
| **Git and GitHub** | Git tracks every change to code; GitHub stores the code online | Our shared repo; each of us works on our own branch |

**Redis in plain words.** MongoDB saves data on disk and is built to keep things forever. Redis keeps data in memory, so it is much faster, and it is good at passing messages between programs. We only need it in Week 3, when we run more than one copy of our server. Until then, ignore it.

## Glossary

| Term | Plain meaning |
| --- | --- |
| Frame | One redraw of the canvas |
| FPS | Frames per second. We aim for 60 |
| Game loop | Code that updates and redraws the screen again and again |
| Throttling | Limiting how often something runs, e.g. send position only 10 times a second |
| Interpolation | Sliding an avatar smoothly between two known positions so it doesn't jump |
| Latency | Delay between something happening and others seeing or hearing it |
| Spawn point | Where your avatar appears when you log in |
| Tile / tilemap | The map is a grid of small square images (tiles); the full grid is a tilemap |
| Collision layer | The part of the map marking tiles you can't walk through (walls, desks) |
| Zone | A marked area of the map, like a meeting room |
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
| Gain | Volume |
| Panning | Moving sound between the left and right ear |
| Attenuation | Sound getting quieter with distance or through walls |
| Index (database) | A shortcut the database keeps so it can find data without checking every record |
| `$near` | A MongoDB query: "find documents near this x, y point" |
| Pub/Sub | Publish/subscribe: programs post messages to a channel, and every listener receives them |
| Contract | Our agreed list of event names and data shapes that every module must use |
| Branch | Your own copy of the code inside the repo, where your commits go |
| Commit | A saved snapshot of your changes, with a message describing them |
| Merge | Combining the changes from one branch into another |
| Merge conflict | Two people changed the same lines; Git can't decide which to keep, so a human must |
| `dev` branch | Our shared testing branch where everyone's work is combined (pending mentor approval) |

## The four modules and who owns what

Each of us owns one module and one folder. Owners for modules 2–4 are picked in the team meeting.

| Module | Owner | Folder | Weeks 1–2 | Mid review demo | Weeks 3–4 |
| --- | --- | --- | --- | --- | --- |
| 1. Signaling + WebRTC connection | Aryan | `server/signaling/`, `client/src/rtc/` | Socket.io server; receive and broadcast positions; relay offer, answer and ICE notes; turn on the mic and connect two browsers | Two browsers talking through our signaling server | Redis adapter so several server copies work together; TURN server; deployment |
| 2. Geospatial engine | TBD | `server/geo/` | MongoDB Atlas setup; user and position schemas with a 2d index; `$near` query for 100 px; "entered/left range" lists | A test script with 50 fake users proving the proximity check takes under 20 ms | Meeting-room zones with `$geoWithin`; saving office maps and walls in MongoDB |
| 3. 2D world (canvas) | TBD | `client/src/world/` | React app; game loop at 60 FPS; load the Tiled map; avatar movement with walls; send position 10 times a second; draw other avatars smoothly | Several avatars walking smoothly around the office | Zone visuals; pass wall data to the audio module; performance check at 60 FPS; polish |
| 4. Spatial audio mixer | TBD | `client/src/audio/` | Volume and left/right pipeline tested on a sample audio file; formula that turns distance into volume and direction into panning | Sound that gets louder and shifts ears as a fake avatar moves around you | Plug real WebRTC voices into the mixer; walls lower volume; stereo polish |

**Why it's split this way.** Signaling and the WebRTC connection are tightly linked and the hardest part to debug, so one person owns both. The audio mixer can be built and tested on any sound file, so its owner never waits for anyone.

**Every module works on its own with fake data.** The canvas runs without a server, the geo engine runs with a test script, and the mixer runs with a sample sound. Nobody is blocked by anyone else.

**Viva:** each person must explain their own module in detail, and the overall flow in this doc at a high level.

## How we work as a team

We work like a small real dev team: four people (and their AI tools) each build one part, and shared files in the repo make sure the parts fit together.

### The one idea that makes this work: contracts

If the canvas code sends `'playerMoved'` and the server listens for `'player:move'`, nothing connects and no error appears. To stop this, every name is defined **once** in a shared file, and everyone imports it:

```js
// shared/events.js — the ONLY place event names live
export const EVENTS = {
  MOVE: 'player:move',          // browser → server   { x, y }
  PEERS_UPDATE: 'peers:update', // server → browser   { entered: [userId], left: [userId] }
  SIGNAL: 'rtc:signal',         // both ways          { to, from, data }
};
```

Now both sides write `EVENTS.MOVE`. A typo like `EVENTS.MOVEE` breaks loudly instead of silently.

### Shared files in the repo

| File | What it's for | Who edits it |
| --- | --- | --- |
| `AGENTS.md` | Rules for every person and AI tool: which folder is yours, read the contracts first, never edit other folders | Aryan |
| `CLAUDE.md` | Points Claude Code to `AGENTS.md` | Aryan |
| `CONTRACTS.md` | Every event, data shape, database schema and function that modules share | Aryan (ask him for changes) |
| `shared/events.js` | Event names in code | Aryan (ask him for changes) |
| `docs/logs/<your-name>.md` | Your daily log: what you built, how it works, problems you hit. These become your viva notes | You only |

### Our branches

- One branch per person, named after you. Push **only** to your own branch.
- **Nobody merges into `main` until after the final review.** This is an Infotact rule.
- At setup, Aryan puts the skeleton (folders and shared files) on `main` once. Each person runs `git merge main` into their branch **once**. After that, nobody touches `main`.
- To test the full app, each person opens a **pull request** (a GitHub request to merge their branch) into a shared `dev` branch, if the mentor allows it. Aryan reviews and merges it. Code only goes **into** `dev`, never back into personal branches. Never click GitHub's "Update branch", "Resolve conflicts" or "Delete branch" buttons on these pull requests.

### Your daily routine

1. Open your AI tool and give it `AGENTS.md` and `CONTRACTS.md` first. Claude Code, Cursor and Copilot read them from the repo; for ChatGPT, paste them in.
2. Build one small piece in **your own folder** and test it with fake data.
3. Ask the AI to explain what it wrote until you understand it.
4. Write 3–5 lines about it in your log, in your own words.
5. Commit the code and the log together, then push to your branch.
6. Post in the team group: what I committed today, and what's blocking me.

### When something breaks

Twice a week (for example Wednesday and Sunday), Aryan combines all branches on `dev` and runs the full app. If your part breaks something, he fixes it locally until it works, then sends you the tested fix as a **patch file** in a GitHub Issue: what broke, why, and the exact change. **You** apply it on your own branch (`git apply <file>`), ask your AI to explain it, and commit it, so the credit and the learning stay with you.

Need a contract changed? Ask Aryan. He updates the shared files and tells everyone in the group.

## Rules that affect our marks

The most important rule: **everyone commits real work to their own branch every day until the final review.**

| Event | Date |
| --- | --- |
| Project start | 10 Oct 2026 |
| Mid review (checks Weeks 1–2) | 27–30 Oct 2026 |
| Final review (checks Weeks 3–4) | about 8–13 Nov 2026 (not announced yet) |

- **Mid review:** commits on at least **10 of the 14 days** before it.
- **Final review:** a commit on **every one of the 20 days** before it. Missing 2 days marks the project incomplete.
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

Prices checked on 12 Oct 2026; free tiers can change.

## What happens next (as of 12 Oct)

- Aryan shows a quick clickable prototype: office map, avatar walking with arrow keys, spawn point, on-screen FPS and position-updates-per-second counters.
- Walk through this doc together; pick owners for modules 2, 3 and 4.
- Everyone sets `git config --global user.email` to their GitHub email and connects their branch on the Infotact dashboard.
- Aryan puts the skeleton on `main`; everyone runs `git merge main` into their branch once; Aryan shares the Week 1 task list per person.
- Aryan asks the mentor the open questions (see 00-context-log.md).
- First integration on `dev` on Sunday 18 Oct. Work Distribution Document by 20 Oct.
