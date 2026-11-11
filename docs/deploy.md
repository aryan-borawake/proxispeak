# Deploying ProxiSpeak (Render + MongoDB Atlas + Metered TURN)

*Owner: Person 1. Covers branch `aryan`, files `render.yaml`, `server/index.js`, `client/src/net/index.js`, `client/src/rtc/rtcManager.js`.*

This guide puts ProxiSpeak on the internet, for free, so anyone with the link can join from their own computer or phone.

---

## The big picture

We need four things:

| Piece | Service | What it is |
|---|---|---|
| The web page | **Render static site** (`proxispeak-client`) | The built React app: plain HTML and JavaScript files. No code runs on Render for it; the browser runs it. |
| The server | **Render web service** (`proxispeak-server`) | Our Node.js server (Express + Socket.io), running all the time on Render's computer. |
| The database | **MongoDB Atlas** | MongoDB in the cloud. Person 2's geo engine stores positions there. |
| The voice relay | **Metered TURN** | A relay for voices when two browsers can't reach each other directly. |

Words first:

- **Deploy** means putting your code on a computer on the internet so other people can use it.
- A **static site** is a set of files that are only *sent* to the browser, never run on the server. `npm run build` makes them in `client/dist/`.
- A **web service** is a program that keeps running and answers requests, like our server.
- An **environment variable** is a setting given to a program from outside, by name, e.g. `MONGODB_URI`. On a laptop they come from the `.env` file. On Render there is no `.env` file; you type them into each service's **Environment** page.
- A **Blueprint** is Render's name for a `render.yaml` file: a list of the services to create and how to build and start each one. Ours is in the repo root.
- **TURN** (Traversal Using Relays around NAT): most home routers and phone networks hide your computer behind a shared address. Usually STUN (a helper that tells your browser its public address) is enough for two browsers to find each other. When it isn't, e.g. laptop on Wi-Fi and phone on mobile data, a TURN server passes the voice along in the middle.

How they talk:

```
 browser ──(downloads page)──► proxispeak-client (static files)
    │
    ├──(Socket.io, https/wss)──► proxispeak-server ──► MongoDB Atlas
    │
    └──(voice, WebRTC)──► other browser   (directly, or through Metered TURN)
```

---

## Step 1: MongoDB Atlas (the database)

1. Go to <https://www.mongodb.com/cloud/atlas> and sign up (free).
2. **Create a cluster.** Pick the **free** one (M0). Any cloud and region is fine; one close to your Render region (e.g. Frankfurt or Singapore) is a little faster. A **cluster** is the group of computers Atlas runs your database on.
3. **Create a database user** (Atlas → *Database Access* → *Add New Database User*).
   - Authentication: **Password**.
   - Pick a user name (e.g. `proxispeak-app`) and click *Autogenerate Secure Password*. Copy the password somewhere safe (a password manager). **Never** put it in the repo, in chat or in a doc.
   - Role: *Read and write to any database*.
4. **Network Access** (Atlas → *Network Access* → *Add IP Address* → *Allow access from anywhere*). This adds `0.0.0.0/0`, which means "any address on the internet may *try* to connect" (it still needs the user name and password).
   - Why? Render's free servers don't have one fixed address, so we can't list just Render.
5. **Get the connection string** (Atlas → *Database* → *Connect* → *Drivers*). It looks like this:

   ```
   mongodb+srv://proxispeak-app:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

   Change two things:
   - Replace `<db_password>` with the real password.
   - Add the **database name** `proxispeak` after `.net/`:

   ```
   mongodb+srv://proxispeak-app:REAL_PASSWORD@cluster0.abcde.mongodb.net/proxispeak?retryWrites=true&w=majority&appName=Cluster0
   ```

   If the password has special characters like `@`, `:`, `/` or `#`, they break the string. The easy fix is to autogenerate a password with letters and numbers only.

   This whole line is the value of **`MONGODB_URI`**. Keep it secret.

You don't need to create the `positions` collection or its index. On start-up the server creates the 2d index `{ loc: '2d', roomId: 1 }` (min 0, max 4096) by itself, and logs `[server] positions index ready`.

---

## Step 2: Metered (the TURN relay)

1. Go to <https://www.metered.ca/stun-turn> and sign up for the **free** plan.
2. In the dashboard open **TURN Server** and click **Add Credential**. Give it a name like `proxispeak`.
3. The dashboard shows a **username**, a **credential** (password) and a list of server addresses, similar to:

   ```
   stun:stun.relay.metered.ca:80
   turn:standard.relay.metered.ca:80
   turn:standard.relay.metered.ca:80?transport=tcp
   turn:standard.relay.metered.ca:443
   turns:standard.relay.metered.ca:443?transport=tcp
   ```

   Copy **the four `turn:` / `turns:` lines** exactly as *your* dashboard shows them (the host name may differ). Skip the `stun:` line; we already use Google's STUN.
   - Why four? The same relay on different ports and transports (UDP port 80, TCP port 80, port 443, encrypted TLS on 443). Strict networks often block all but one, so the browser tries each.
4. Join them into **one line, separated by commas, no spaces**. That's **`VITE_TURN_URL`**:

   ```
   turn:standard.relay.metered.ca:80,turn:standard.relay.metered.ca:80?transport=tcp,turn:standard.relay.metered.ca:443,turns:standard.relay.metered.ca:443?transport=tcp
   ```

   The username is **`VITE_TURN_USERNAME`**, the credential is **`VITE_TURN_CREDENTIAL`**.

**Important:** every `VITE_` value is baked into the JavaScript the browser downloads, so anyone who opens the site can read the TURN credential. That's normal for TURN, but it's why this credential must be used **only** for ProxiSpeak. If it leaks or gets abused, delete it in Metered and add a new one.

---

## Step 3: Render (both services from the Blueprint)

1. Push branch `aryan` to GitHub (it must contain `render.yaml`).
2. Go to <https://render.com>, sign up with GitHub, and allow Render to see the ProxiSpeak repo.
3. Click **New → Blueprint**, pick the ProxiSpeak repo, and choose branch **`aryan`**.
4. Render reads `render.yaml` and lists two services, `proxispeak-server` and `proxispeak-client`. It then asks for every variable marked `sync: false` (they are secrets, or not known yet). Fill them in using the table below.
5. Click **Apply**. Render builds and starts both. The first build takes a few minutes.

### Which variable goes to which service

| Service | Variable | Value |
|---|---|---|
| `proxispeak-server` | `MONGODB_URI` | The Atlas string from step 1 (ends in `/proxispeak?...`) |
| `proxispeak-server` | `CLIENT_ORIGIN` | The client's address, e.g. `https://proxispeak-client.onrender.com` (no `/` at the end) |
| `proxispeak-server` | `NODE_VERSION` | Already set by `render.yaml` (24.15.0). Don't touch. |
| `proxispeak-server` | `PORT` | **Don't set it.** Render sets it by itself, and the server reads it. |
| `proxispeak-client` | `VITE_SERVER_URL` | The server's address, e.g. `https://proxispeak-server.onrender.com` (`https`, no `/` at the end) |
| `proxispeak-client` | `VITE_TURN_URL` | The comma-separated list from step 2 |
| `proxispeak-client` | `VITE_TURN_USERNAME` | The Metered username |
| `proxispeak-client` | `VITE_TURN_CREDENTIAL` | The Metered credential |

Never give `MONGODB_URI` to the client. Anything the client gets is public.

### The order problem (and how to solve it)

There's a chicken-and-egg problem:

- The **server** needs the client's address in `CLIENT_ORIGIN`, or it refuses the browser (CORS).
- The **client** needs the server's address in `VITE_SERVER_URL`, and this value is **baked in at build time**. Changing it later does nothing until the client is **built again**.

But you only know each address for sure after Render has created the service.

The solution:

1. When the Blueprint asks, type the **expected** addresses: Render uses `https://<service-name>.onrender.com`, so:
   - `CLIENT_ORIGIN` = `https://proxispeak-client.onrender.com`
   - `VITE_SERVER_URL` = `https://proxispeak-server.onrender.com`
2. After the first deploy, open each service in the Render dashboard and read its real address at the top of the page. If the name was already taken, Render adds a few random letters (e.g. `https://proxispeak-server-x7k2.onrender.com`).
3. If an address is different from what you typed:
   - **Server:** *proxispeak-server → Environment*, fix `CLIENT_ORIGIN`, choose **Save, rebuild, and deploy**. The server only reads it at start-up, so it must restart.
   - **Client:** *proxispeak-client → Environment*, fix `VITE_SERVER_URL`, choose **Save, rebuild, and deploy**. The client **must be built again**, because the old address is baked into the old files.
4. Same rule for TURN: after changing any `VITE_TURN_*`, the client must be rebuilt.

Example: the server came out as `https://proxispeak-server-x7k2.onrender.com`. You set `VITE_SERVER_URL` to that on the client and rebuild. In the browser console you now see `[net] connected to https://proxispeak-server-x7k2.onrender.com as ...`.

---

## Step 4: Check it works

1. Open `https://<your-server>.onrender.com/api/health`. You should see:

   ```json
   {"ok":true,"engine":"geo","uptimeS":42}
   ```

   - `engine: "geo"` means MongoDB Atlas works. `"fakeNearby"` means the server couldn't use Atlas and is measuring distances in memory instead (the app still works, but see Troubleshooting).
   - `uptimeS` is how many seconds the server has been running.
2. Open `https://<your-client>.onrender.com/`. You should see **Office (all modules)** with a *Join the office* button. The test pages still work: `/?lab=rtc`, `/?lab=world`, `/?lab=audio`.
3. Open the browser's DevTools (F12) → **Console**, click *Join the office* and allow the microphone. You should see:
   - `[net] connected to https://<your-server>.onrender.com as ...`
   - `[rtc] ICE servers: stun:stun.l.google.com:19302, turn:..., turn:..., turn:..., turns:...`

   If the second line ends with `(no TURN: ...)`, the `VITE_TURN_*` values were missing when the client was built.

---

## Reading the Render logs

Every service has a **Logs** page (dashboard → service → *Logs*). It shows everything the server prints with `console.log`, live.

A healthy server start looks like this:

```
[server] settings: no .env file, using environment variables only (normal on Render)
[geo] connected
[server] positions index ready: { loc: '2d', roomId: 1 }
[server] nearby engine: geo (Person 2, MongoDB)
[signaling] ready: listening for joins, moves and signals
[server] allowed origins: http://localhost:5173, https://proxispeak-client.onrender.com
[server] listening on 0.0.0.0:10000 (engine: geo)
```

(The port number is whatever Render chose; that's fine.)

What to look for:

- **`allowed origins`**: your client's address must be in this list, spelled exactly like the address bar (`https://`, no `/` at the end).
- **`nearby engine:`**: `geo` or `fakeNearby`, and if fakeNearby, the reason.
- **`[signaling] player joined: ...`**: someone joined. **`[tick] entered: ...`**: two people came within earshot.

The client is a static site, so its *Logs* page only shows the **build** (`npm ci`, `vite build`). Errors that happen while using the app show up in the browser's Console instead.

---

## The free plan: sleep and wake-up

Render's free web service **goes to sleep after 15 minutes without any visitors**. The next visitor wakes it up, which takes **about a minute**. During that minute:

- the health page loads slowly;
- the app's *Join the office* may fail with `[net] join timed out` or `could not connect`. Wait a minute and click again.

So, **before a demo**, open `https://<your-server>.onrender.com/api/health` a minute early and wait until it answers. While someone is connected (Socket.io keeps a connection open), the server stays awake.

When it wakes up, the server starts fresh: everyone who was in the office is forgotten (positions live in memory), and each open tab joins again by itself.

The static site (the client) never sleeps.

---

## Test from two different networks

Two tabs on one laptop always work, even without TURN, because they are on the same machine. The real test is two **different** networks:

1. **Laptop** on Wi-Fi: open the client address, join as `Laptop`, allow the mic.
2. **Phone** with **Wi-Fi switched off** (mobile data only): open the same address, join as `Phone`, allow the mic.
3. Both start at the spawn point, 0 px apart, so they connect at once. The phone has no arrow keys, so walk with the **laptop**: away from the phone (the voice fades out, and the connection closes beyond 140 px), then back (it reconnects within 100 px).
4. Use headphones on at least one side, or you'll hear an echo.
5. If you hear each other: TURN (or a direct path) works. To see which one was used, open `chrome://webrtc-internals` on the laptop during the call. If the selected candidate pair shows type **`relay`**, the voice went through Metered.

---

## Troubleshooting

**CORS error in the browser console** (e.g. `blocked by CORS policy: No 'Access-Control-Allow-Origin' header`)
The server doesn't know the client's address. Check the `[server] allowed origins:` line in the server log. `CLIENT_ORIGIN` must be exactly the client's address: `https://`, the right name, no `/` at the end, no path. Fix it, then *Save, rebuild, and deploy* the server.

**Socket.io stuck on polling** (in DevTools → *Network*, you only see many `socket.io/?EIO=4&transport=polling` requests and no `transport=websocket` with status `101`)
Socket.io starts with polling (repeated normal requests) and then upgrades to a WebSocket (one open connection). If it never upgrades: check `VITE_SERVER_URL` starts with `https://` (not `http://`, which an `https` page can't use), and try another network, since some school or office firewalls block WebSockets. Polling still works, just slower.

**Microphone blocked** (`[rtc] ...` error about the microphone, or no permission prompt)
Browsers only allow the microphone on `https://` pages, or on `http://localhost`. Render addresses are `https`, so use those. Opening the app as `http://192.168.x.x:5173` from a phone will **not** work. Also check the browser's site settings (the padlock icon next to the address) and that the mic isn't used by another app.

**No voice between different networks** (works on one laptop, silent between laptop and phone)
That's TURN. In the browser console, the `[rtc] ICE servers:` line must list the `turn:` addresses. If it says `(no TURN: ...)`, set all three `VITE_TURN_*` on the **client** and rebuild it. If the addresses are there, check the username and credential in Metered (copy them again; a credential that was deleted stops working), and look in `chrome://webrtc-internals` for `relay` candidates.

**`/api/health` shows `"engine":"fakeNearby"`**
The server couldn't use Atlas. The server log says why, on the lines just before `nearby engine: fakeNearby`:
- `MONGODB_URI is not set`: add it to the **server** service.
- `MongoDB did not connect within 10000 ms`: usually Atlas *Network Access* doesn't have `0.0.0.0/0`, or the cluster host in the string is wrong.
- `bad auth` / `Authentication failed`: wrong user name or password in the string (or a special character in the password).
- `geo self-check failed`: the connection works but `findNearby` didn't answer correctly. Send the log line to Person 2.

After fixing, restart the server (*Manual Deploy → Deploy latest commit*, or *Save, rebuild, and deploy* after changing a variable). The app still works on fakeNearby with one server, so a demo can go ahead.
