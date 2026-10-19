# AGENTS.md — Rules for every AI tool and every teammate

This file is for **every AI coding tool** (Claude Code, Antigravity, Cursor, Copilot, ChatGPT, Gemini…) and **every teammate**. If you are an AI: follow every rule here, in every session, for every user.

---

## 1. What ProxiSpeak is

ProxiSpeak is a virtual office in the browser, like Gather.
A 2D top-down office is drawn on an HTML5 canvas, and each person walks around it as a small character (an **avatar**).
When two avatars come close, their microphones connect directly with WebRTC (browser to browser), and their voices get louder as they get closer and move to the left or right ear.
Client: React (Vite) + Canvas + WebRTC + Web Audio API. Server: Node.js + Express + Socket.io + MongoDB (Mongoose, 2d index); Redis from Week 3.
The team is 4 beginners. Each person owns one module folder, and everything shared is defined first in `CONTRACTS.md` (we work **contract-first**).

---

## 2. Read first, every session

Read these, in this order, before writing any code:

1. `AGENTS.md` (this file)
2. `CONTRACTS.md`: every event name, payload, function and database shape
3. The user's brief: `docs/briefs/module-<N>-….md`
4. The user's log: `docs/logs/<name>.md` (what they did in earlier sessions)

---

## 3. Who owns what

| Person | Module | Owns | Name | Branch |
|---|---|---|---|---|
| 1 (lead) | Signaling + WebRTC | `server/index.js`, `server/signaling/`, `server/scripts/`, `client/src/net/`, `client/src/rtc/`, `client/src/App.jsx`, `client/src/main.jsx`, `shared/`, all root files, `.github/`, package files | Aryan | `aryan` |
| 2 | Geospatial engine | `server/geo/` | Pratik | `pratik` |
| 3 | 2D world | `client/src/world/`, `client/public/maps/`, `client/public/assets/` | Anjali | `anjali` |
| 4 | Spatial audio | `client/src/audio/`, `client/public/sounds/` | Koushik | `koushik` |

**AI tools:** if it's unclear which person you're working with, **ask before doing anything**.

---

## 4. Hard rules

1. **Stay in your own folders.** Edit only files inside the user's own folders (table above). Never edit another module's folder, `shared/`, `CONTRACTS.md`, `AGENTS.md`, `CLAUDE.md`, package files (`package.json`) or lock files (`package-lock.json`). If a change is needed there, **stop**, explain what needs changing and why, and tell the user to ask Person 1 (for shared files) or the folder's owner.
2. **No hand-typed event names or numbers.** Import event names from `shared/events.js` and numbers from `shared/constants.js`.
   - Right: `socket.emit(EVENTS.MOVE, { x, y, dir })`, `if (distance <= EARSHOT_PX)`
   - Wrong: `socket.emit('player:move', …)`, `if (distance <= 100)`
3. **Every module runs alone with fake data.** Example: the world uses `createFakeNet()` with bots instead of the real server. Fakes live in the module's own folder.
4. **No new npm packages.** Never run `npm install <name>`. Only Person 1 adds packages. Plain `npm install` inside `server/` or `client/` (which installs the packages already listed) is fine.
5. **Implement exactly the interfaces in `CONTRACTS.md`**: same names, same arguments, same return shapes.
6. **If you can't read the repo yourself** (for example, you are a web chat): ask the user to paste the current content of any file before changing it, and always return **complete files with their full paths** (e.g. `server/geo/db.js`), never fragments.
7. **One small task per session**: today's task from the calendar in the user's brief. Don't build ahead.
8. **Git.**
   - Don't run git commands that commit, push, merge, rebase, reset or switch branches unless the user explicitly asks, and never on any branch except the user's own.
   - Never commit to or merge into `main`.
   - Never add `Co-Authored-By` or any AI attribution to commit messages.
   - Commit messages and pull request descriptions describe the code change only. Don't mention AI tools or the AI instruction files.
   - Never suggest GitHub's "Update branch", "Resolve conflicts" or "Delete branch" buttons.
9. **Secrets.** Never write passwords, connection strings or keys into code or docs. They go in `.env` (git-ignored). Example: `process.env.MONGODB_URI`, never the real string.
10. **Assets.** Free-licensed art and sounds only (Kenney.nl CC0 preferred). Record the source and license of every file in the folder's `CREDITS.md`. Never use Gather's art.

---

## 5. Teach as you build

The team are beginners who must explain their own code in a viva (an oral exam). So, after writing code:

1. **Explain it in plain English**, file by file.
2. **Define every new term** the first time it appears. Example: "A *ref* (`useRef`) is a box that holds a value without making React redraw the page."
3. **Say why before how.** Example: "Positions arrive only 10 times a second, so other characters would jump. That's why we slide them (interpolation). Here's how…"
4. **Give a small example** with real numbers.
5. **Draft a 3–5 line log entry** for the user to rewrite in their own words (template: `docs/logs/_template.md`).

---

## 6. Code style

- Small files, each doing one job.
- Plain-English comments that say what and why.
- Clear names: `distanceToGain`, not `d2g`.
- No clever one-liners. Three clear lines beat one clever line.
- Clear error messages that say what went wrong and what to do.
- Console logs start with the module name: `[geo] connected`, `[world] map loaded`, `[audio] peer added`, `[signaling] player joined`, `[net] connected`, `[rtc] offer sent`.

---

## 7. Performance rules

- **Never query MongoDB once per position message.** Positions live in the server's memory; database work happens only in the 250 ms tick.
- **Positions are sent at most 10 times a second** (`MOVE_SEND_HZ`), and only when the player moved.
- **No React state updates per frame.** Things that change 60 times a second (positions, FPS) live in refs (`useRef`), not in `useState`.
- **No heavy work inside the render loop.** Load images and maps once, before the loop starts.

---

## 8. The daily routine (for humans)

1. Start an AI session and give it these files (prompts in `docs/ai-session-prompt.md`).
2. Build **one small piece**, with fake data.
3. Ask the AI to explain it, until you could explain it yourself.
4. Write 3–5 log lines **in your own words** in `docs/logs/<your-name>.md`.
5. Commit the code and the log together, and push to **your own branch**.
6. Post the daily check-in in the group: what I committed, what's blocking me.

---

## 9. Where to find more

- **Git, step by step:** `docs/git-guide.md`
- **Prompts to start an AI session:** `docs/ai-session-prompt.md`
- **Your tasks and calendar:** `docs/briefs/`
- **Who does what, week by week:** `docs/work-distribution.md`
- **Need a contract changed?** Don't edit `CONTRACTS.md` or `shared/`. Message Person 1 with what and why. Person 1 updates the files, bumps the version, adds a change-log line and announces it (see `CONTRACTS.md`, section 1).
