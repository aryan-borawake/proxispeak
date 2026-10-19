# ProxiSpeak

*README owner: Person 1.*

ProxiSpeak is a virtual office in the browser, like Gather. You walk a small character around a 2D office map. When you walk up to a colleague, you can hear them: their voice gets louder as you get closer, and comes from the left or right depending on where they stand. Walk away, and the conversation fades out.

---

## Tech stack

| Part | Technology | What it does |
|---|---|---|
| Web page | React + Vite | Builds the page; Vite is the fast development server |
| Office drawing | HTML5 Canvas | Draws the map and characters 60 times a second |
| Voice | WebRTC | Sends voices directly from browser to browser |
| Sound placement | Web Audio API | Sets each voice's volume and left/right position |
| Server | Node.js + Express | Runs our backend; answers web addresses like `/api/health` |
| Live messages | Socket.io | Keeps a connection open between each browser and the server |
| Database | MongoDB + Mongoose (2d index) | Stores positions and answers "who is near whom?" fast |
| Scaling (Week 3) | Redis | Lets two copies of the server share messages |

---

## Run it locally

You need [Node.js](https://nodejs.org) (version 20.19 or newer) and, for the geo module, [MongoDB Community Server](https://www.mongodb.com/try/download/community).

**1. Settings.** In the repo root, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The defaults work on your laptop. Never commit `.env`.

**2. Install packages** (once, and again whenever Person 1 adds a package):

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

**3. Start the server** (terminal 1):

```bash
npm run dev:server
```

You should see `[server] listening on 3001`. Check it at http://localhost:3001/api/health, which shows `{"ok":true}`.

**4. Start the web page** (terminal 2):

```bash
npm run dev:client
```

Open http://localhost:5173. Test pages for each module:

- http://localhost:5173/?lab=world: 2D world (Person 3)
- http://localhost:5173/?lab=audio: spatial audio (Person 4)
- http://localhost:5173/?lab=rtc: signaling and WebRTC (Person 1)

---

## Folder structure

```
AGENTS.md, CLAUDE.md        Rules for AI tools and teammates                      Person 1
CONTRACTS.md                Every event, function and data shape, defined once    Person 1
shared/                     events.js and constants.js, used by server and client Person 1
server/
  index.js                  Starts the server                                     Person 1
  signaling/                Players, position broadcast, proximity tick, WebRTC notes  Person 1
  scripts/                  50-bot load test (Week 3)                             Person 1
  geo/                      MongoDB "who is near whom?" engine                    Person 2
client/
  index.html, src/main.jsx, src/App.jsx   The page that plugs modules together   Person 1
  src/net/                  The browser's connection to the server                Person 1
  src/rtc/                  Microphone and voice connections                      Person 1
  src/world/                Canvas, map, movement, avatars                        Person 3
  public/maps/, public/assets/   Tiled office map and character art               Person 3
  src/audio/                Volume and left/right mixer, mic meter                Person 4
  public/sounds/            Sample sounds                                         Person 4
docs/
  briefs/                   Each module's plan, task by task
  work-distribution.md      Who does what, week by week
  logs/                     Each person's daily log
  git-guide.md              Git, step by step
  ai-session-prompt.md      Prompts to start an AI session
.github/                    Pull request and fix-patch templates                  Person 1
```

---

## Team

| Person | Module | Name | Branch |
|---|---|---|---|
| 1 (lead) | Signaling + WebRTC | Aryan | `aryan` |
| 2 | Geospatial engine | Pratik | `pratik` |
| 3 | 2D world | Anjali | `anjali` |
| 4 | Spatial audio | Koushik | `koushik` |

---

## Docs

- [AGENTS.md](AGENTS.md): rules for every AI tool and teammate. Read it first.
- [CONTRACTS.md](CONTRACTS.md): the shared contracts.
- [docs/work-distribution.md](docs/work-distribution.md): who does what, and when.
- [docs/briefs/](docs/briefs/): each module's brief.
- [docs/git-guide.md](docs/git-guide.md): Git for our rules.
- [docs/ai-session-prompt.md](docs/ai-session-prompt.md): prompts for starting an AI session.
- [docs/logs/_template.md](docs/logs/_template.md): daily log template.
