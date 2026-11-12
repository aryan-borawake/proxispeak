# 09 — Deployment: Render, Atlas, Metered

*Files: `render.yaml`, `.env.example`, `server/index.js` (settings, CORS, start-up order, health check), `client/vite.config.js`, `client/src/net/index.js` (`SERVER_URL`), `client/src/rtc/rtcManager.js` (TURN), `server/office/reset-demo.js`, `server/office/seed.js`. The click-by-click guide is `docs/deploy.md`.*

**Deploying** means putting the app on computers on the internet so anyone with the link can use it.

---

## 1. The four pieces

```
 browser ──(downloads the page)──────────► proxispeak-client   (Render static site: HTML + JS files)
    │
    ├──(Socket.io over wss, REST over https)──► proxispeak-server (Render web service: Node) ──► MongoDB Atlas
    │
    └──(voice, WebRTC)──► other browser      (directly, or relayed by Metered TURN)
```

In words: the browser downloads the page from the static site, talks to our Node server for everything live, and the server talks to Atlas; the voice goes between browsers, through Metered only when needed.

| Piece | Service | Plan | What runs there |
|---|---|---|---|
| Web page | Render **static site** `proxispeak-client` | free | nothing runs; Render only sends files built by `npm run build` |
| Server | Render **web service** `proxispeak-server` | free | `node index.js`: Express + Socket.io |
| Database | MongoDB Atlas M0 cluster | free | `positions`, `areas`, `rooms`, the directory |
| Voice relay | Metered TURN | free | relays voices that can't go directly |

- A **static site** is a set of files that are only sent to the browser, never run on the server.
- A **web service** is a program that keeps running and answers requests.
- **wss / https** are the encrypted versions of WebSocket and web requests. Render gives both services `https://…onrender.com` addresses.

---

## 2. The Render Blueprint (`render.yaml`)

A **Blueprint** is a file that tells Render which services to create from the repo and how to build and start each one.

```yaml
services:
  - type: web
    name: proxispeak-server
    runtime: node
    plan: free
    branch: aryan
    buildCommand: cd server && npm ci
    startCommand: cd server && npm start
    healthCheckPath: /api/health
    envVars: [ NODE_VERSION 24.15.0, MONGODB_URI, CLIENT_ORIGIN, AUTH_SECRET, ADMIN_PASSWORD ]   # shortened
  - type: web
    name: proxispeak-client
    runtime: static
    branch: aryan
    buildCommand: cd client && npm ci && npm run build
    staticPublishPath: client/dist
    routes: [ { type: rewrite, source: /*, destination: /index.html } ]
    envVars: [ NODE_VERSION, VITE_SERVER_URL, VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL ]
```

What each line is for:

1. **Both services deploy from branch `aryan`**, not `main` (the team rule: nobody merges into `main` without the lead).
2. **`npm ci`** installs exactly the versions in `package-lock.json` (repeatable builds), not newer ones.
3. **`healthCheckPath: /api/health`**: Render calls it to know the server is up (a new deploy goes live only once it answers, and a server that stops answering is noticed).
4. **The rewrite `/* → /index.html`**: the app is one page that reads `#/office` or `?lab=…` itself, so any address must return `index.html`.
5. **`sync: false`** on a variable means "secret or not known yet: ask for it in the dashboard, never store it in this file". Every secret is `sync: false`.
6. `NODE_VERSION 24.15.0`: the same Node as on our laptops (Vite needs 20.19 or newer).

---

## 3. Every environment variable and who reads it

An **environment variable** is a named setting given to a program from outside. On a laptop they come from the repo-root `.env` file (git-ignored, copied from `.env.example`). On Render there is no `.env`; they are typed into each service's Environment page.

### Server (`proxispeak-server`)

| Variable | Read by | What it does | If missing |
|---|---|---|---|
| `PORT` | `server/index.js` | the port to listen on; **Render sets it**, don't | 3001 |
| `CLIENT_ORIGIN` | `server/index.js` (`readAllowedOrigins`) | which web pages may call the server (CORS), comma-separated, no trailing `/` | only `http://localhost:5173` allowed → the deployed page is refused |
| `MONGODB_URI` | `server/index.js` (`startGeoEngine`); also `office/seed.js`, `office/reset-demo.js`, `geo/scripts/*` | the Atlas connection string, ending in `/proxispeak` | `nearby engine: fakeNearby`, demo directory in memory, nothing saved |
| `AUTH_SECRET` | `server/auth/secrets.js` | the HMAC key that signs tokens | a random key per start: every restart signs everyone out |
| `ADMIN_PASSWORD` | `server/auth/secrets.js`; also the robot tests and `load-test.js` | the Admin tab's password | admin sign-in refused |
| `NODE_VERSION` | Render's build | Node version | Render's default |

**CORS** (Cross-Origin Resource Sharing) is the browser rule that a page from one address may call a server at another address only if that server says it allows the page's **origin** (scheme + host + port, e.g. `https://proxispeak-client.onrender.com`). Our server allows exactly the origins in `CLIENT_ORIGIN`, plus `http://localhost:5173` always, for both Express and Socket.io. It logs `[server] allowed origins: …` at start-up so a CORS problem is easy to spot.

### Client (`proxispeak-client`), baked in at build time

| Variable | Read by | What it does | If missing |
|---|---|---|---|
| `VITE_SERVER_URL` | `client/src/net/index.js` | the server's address | `http://localhost:3001` |
| `VITE_TURN_URL` | `client/src/rtc/rtcManager.js` | Metered TURN addresses, comma-separated (4 of them) | STUN only; some networks get no voice |
| `VITE_TURN_USERNAME` | same | TURN user name | STUN only |
| `VITE_TURN_CREDENTIAL` | same | TURN password | STUN only |

Every `VITE_` value is copied into the JavaScript the browser downloads, so it is **public** and it is **baked in**: changing it on Render does nothing until the client is built again (see `03-webrtc-stun-turn.md`, section 7). `MONGODB_URI`, `AUTH_SECRET` and `ADMIN_PASSWORD` must never get a `VITE_` name.

`.env.example` also lists `REDIS_URL`, commented out: nothing reads it yet (`12-redis.md`).

### The order problem

The server needs the client's address (`CLIENT_ORIGIN`), and the client needs the server's address (`VITE_SERVER_URL`, baked in). Neither is certain until Render creates the services.

1. Type the expected addresses when the Blueprint asks: `https://proxispeak-client.onrender.com` and `https://proxispeak-server.onrender.com`.
2. After the first deploy, read the real addresses in the dashboard (Render adds random letters if a name is taken).
3. If different: fix `CLIENT_ORIGIN` and redeploy the server; fix `VITE_SERVER_URL` and **rebuild** the client.

---

## 4. Atlas

1. A free M0 cluster.
2. A database user with a generated password (letters and digits only: characters like `@ : / #` break the connection string).
3. **Network Access `0.0.0.0/0`** ("any address may try; the password is still needed"), because Render's free servers have no fixed address.
4. The connection string with `/proxispeak` added before the `?`, as `MONGODB_URI` on the server only.

The server creates the 2d index itself and logs `[server] positions index ready`. On start-up it also seeds an empty database with the demo directory, so seeding by hand is optional:

```bash
# bash
MONGODB_URI="<your Atlas string ending in /proxispeak>" node server/office/seed.js
# PowerShell
$env:MONGODB_URI="<your Atlas string>"; node server/office/seed.js
```

Start-up order in `server/index.js`, and why:

1. Load `.env` if it exists (on Render it doesn't: the log says "using environment variables only").
2. Connect to MongoDB within 10 s, build the index within 5 s, run the geo self-check within 5 s. Any failure → `fakeNearby` (the server must always start).
3. `loadOffice()`: the directory into memory.
4. For each floor: store / load the layout and its areas.
5. Attach signaling (the tick starts), mount the routes.
6. Only then `listen(PORT, '0.0.0.0')`, so no browser can join before the tick and the directory are ready. `0.0.0.0` means "every network card", because Render forwards visitors from outside the machine.

A healthy Render log:

```
[server] settings: no .env file, using environment variables only (normal on Render)
[geo] connected
[server] positions index ready: { loc: '2d', roomId: 1 }
[server] nearby engine: geo (Person 2, MongoDB)
[office] loaded from MongoDB: 17 employees, 5 departments, 1 floor(s)
[server] floor-1: layout version 1 (generated), 66 areas stored in MongoDB
[signaling] ready: listening for joins, moves and signals
[server] allowed origins: http://localhost:5173, https://proxispeak-client.onrender.com
[server] listening on 0.0.0.0:10000 (engine: geo)
```

The health check: `GET /api/health` → `{ ok: true, engine: 'geo', uptimeS: 42, tick: { avgMs, p95Ms, maxMs, … } | null }`. `engine: 'fakeNearby'` means Atlas isn't in use; the log lines before it say why.

---

## 5. Metered TURN

1. Free plan → TURN Server → Add Credential (name it `proxispeak`).
2. Copy the four `turn:` / `turns:` addresses (UDP 80, TCP 80, 443, TLS 443) into `VITE_TURN_URL`, comma-separated, no spaces. Skip the `stun:` line: we use Google's STUN.
3. Username → `VITE_TURN_USERNAME`, credential → `VITE_TURN_CREDENTIAL`.
4. Rebuild the client. The console then shows `[rtc] ICE servers: stun:…, turn:…, …`.
5. The credential is public in the page, so use it only for ProxiSpeak; if abused, delete it and make a new one.

Testing it: two **different** networks (laptop on Wi-Fi, phone on mobile data), headphones on one side. `chrome://webrtc-internals` shows candidate type `relay` when the voice went through Metered.

---

## 6. Region and latency

`render.yaml` sets no `region`, so Render uses its Blueprint default (Oregon, US West) unless a different region is picked in the dashboard. `docs/deploy.md` says to put the Atlas cluster close to the Render region.

Why the region matters more than it seems: one tick waits for the database **three times in a row**:

```
bulkWrite  →  locateUsers aggregate  →  all findNearby (in parallel)
```

So one tick costs about 3 database round trips. With Render and Atlas in the same region a round trip is a few ms. If they were on different continents (say 150 ms round trip), one tick would take about 450 ms, longer than the 250 ms interval. Ticks would then be skipped (`tickIsRunning`) and voices would connect about twice as slowly. Check: `/api/health` → `tick.avgMs` on the deployed server.

What the region does **not** change: the voice itself. A direct WebRTC connection goes between the two browsers, wherever the server is. Positions on screen (`players:state`) and the start of a voice connection do go through the server, so they get one server round trip of delay.

---

## 7. Cold starts and memory

Render's free web service **sleeps after 15 minutes without visitors**. The next visitor wakes it, which takes **about a minute**; meanwhile joins may fail with `[net] join timed out`.

1. Before a demo, open `https://<server>/api/health` a minute early and wait until it answers.
2. While someone is connected, the open Socket.io connection keeps the server awake.
3. A wake-up is a fresh start: positions, peer sets and Socket.io rooms (all in memory) are gone. Open tabs re-join by themselves (`net` re-sends `player:join`). The directory, layouts and areas come back from Atlas.
4. Without `AUTH_SECRET` set, a restart would also sign everyone out. It must be set on Render.

The static site never sleeps.

---

## 8. Resetting the demo

Admin actions, the screenshot walkthrough and `floor-test.js` really change the directory (sample hires, Floor 2, moved departments). Before a demo:

```bash
MONGODB_URI="<the database you want to reset>" node server/office/reset-demo.js --yes
```

1. It refuses without `--yes`.
2. It deletes all employees, departments, floors and alerts in the database `MONGODB_URI` points at, then re-seeds the 16 demo people + admin, 5 departments, Floor 1 at tier 1.
3. Restart the server (Render: Manual Deploy, or Restart), because the server loads the directory only at start-up.

Stored layouts (`rooms`) are not reset by this script; an uploaded layout stays until the admin clicks **Use generated**.

---

## 9. Note on the older guide

`docs/deploy.md` predates v5 in two places: its variable table does not list `AUTH_SECRET` and `ADMIN_PASSWORD` (they are in `render.yaml` and section 3 above), and its "check it works" step describes the old "Office (all modules)" page (the root address now shows the landing page; the labs are still at `?lab=…`).
