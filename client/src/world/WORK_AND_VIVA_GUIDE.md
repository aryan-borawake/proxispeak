# ProxiSpeak — Module 3: 2D World (Canvas Engine)
## Complete Work Portfolio, Technical Reference & Viva Guide

**Author:** Anjali (Person 3)  
**Role:** 2D World Engineer  
**Branch:** `anjali`  
**Owned Paths:**
- `client/src/world/` (`WorldCanvas.jsx`, `map.js`, `fakeNet.js`, `WorldLab.jsx`, `index.js`, `README.md`)
- `client/public/maps/` (`office.json`, `office.tmx`, `Interiors_free_32x32.png`, `Room_Builder_free_32x32.png`)
- `client/public/assets/` (`CREDITS.md`)
- `docs/logs/anjali.md`

---

## Table of Contents
1. [Executive Summary & 1-Minute Viva Intro](#1-executive-summary--1-minute-viva-intro)
2. [What I Built — Full Technical Architecture](#2-what-i-built--full-technical-architecture)
   - [A. 60 FPS Canvas Game Loop & Non-Blocking State](#a-60-fps-canvas-game-loop--non-blocking-state)
   - [B. Movement Physics, Delta-Time & Wall Sliding](#b-movement-physics-delta-time--wall-sliding)
   - [C. Tiled Map Engine & Affine Matrix Rendering](#c-tiled-map-engine--affine-matrix-rendering)
   - [D. Network Throttling & Exponential Interpolation (Lerp)](#d-network-throttling--exponential-interpolation-lerp)
   - [E. Autonomous Bot Swarm & Standalone Testing (`fakeNet.js`)](#e-autonomous-bot-swarm--standalone-testing-fakenetjs)
3. [The Complete Office Structure (110×80 Tiles)](#3-the-complete-office-structure-11080-tiles)
   - [A. Acoustic Zones & Hearing Types](#a-acoustic-zones--hearing-types)
   - [B. Tier Expansion System & Dust Sheet Overlays](#b-tier-expansion-system--dust-sheet-overlays)
   - [C. Meeting Room Focus Spotlight (`drawAreaFocus`)](#c-meeting-room-focus-spotlight-drawareafocus)
   - [D. Snake Desk Numbering & Department Blocks](#d-snake-desk-numbering--department-blocks)
4. [Cross-Module Integration (How My Code Connects)](#4-cross-module-integration-how-my-code-connects)
5. [Viva Defense Masterclass (Top 10 Questions & Answers)](#5-viva-defense-masterclass-top-10-questions--answers)
6. [Daily Engineering Log Summary](#6-daily-engineering-log-summary)

---

## 1. Executive Summary & 1-Minute Viva Intro

### The 1-Minute Spoken Viva Script
> *"Good morning/afternoon. In ProxiSpeak, I am **Person 3**, responsible for **Module 3: the 2D World**.*
>
> *My module is the visual and physical core of the virtual office. I built the HTML5 Canvas rendering engine that draws our entire virtual workspace, powers character movement, handles obstacle collisions, and renders remote teammates in real time.*
>
> *To guarantee a smooth 60 FPS experience, I decoupled the rendering pipeline from React's state tree using `useRef` and implemented framerate-independent delta-time movement with wall-sliding physics. To handle network updates smoothly, I built exponential interpolation that turns 10 Hz position packets into continuous gliding with zero visual jitter.*
>
> *Furthermore, I integrated our 66 acoustic zones: when a user enters a private meeting room or stage hall, my engine renders the visual focus overlay, darkens outside distractions, and reports exact coordinate streams upstream to Person 4’s spatial audio mixer and Person 1’s WebRTC engine.*
>
> *My entire module runs 100% standalone using my custom `fakeNet` bot simulator, allowing full verification without requiring the backend server."*

---

## 2. What I Built — Full Technical Architecture

### A. 60 FPS Canvas Game Loop & Non-Blocking State
- **Problem:** Updating React component state (`useState`) 60 times a second forces React to recalculate the virtual DOM and re-render components on every frame, causing catastrophic frame drops, garbage collection pauses, and battery drain.
- **My Solution:** All high-frequency runtime data (player coordinates, camera positions, held keys, frame counters) live strictly inside React mutable references (`useRef`):
  ```js
  const playerRef = useRef({ x: 150, y: 150, speed: 180, dir: 'down' });
  const othersRef = useRef(new Map());
  const keysRef = useRef({});
  ```
- **Loop Lifecycle:** Managed via `requestAnimationFrame(render)`. Automatically pauses execution when the browser tab is hidden or minimized, conserving CPU/GPU cycles.
- **Accurate FPS Counter:** Decoupled frame-delta timing from the 1-second display timer using a double-clock architecture so the FPS counter updates cleanly once every 1,000 ms.

### B. Movement Physics, Delta-Time & Wall Sliding
- **Delta-Time Normalization:** Movement speed is calculated per second, not per frame:
  $$\text{stepPx} = \text{WALK\_SPEED\_PX\_PER\_SEC} \times \Delta t \quad (180\text{ px/sec} \times 0.0167\text{ s} \approx 3.0\text{ px/frame})$$
  Ensures identical walking velocity on 60 Hz, 120 Hz, and 144 Hz gaming monitors.
- **Delta Clamping (`MAX_DELTA_SEC = 0.05`):** If a user backgrounds their tab for 3 seconds, $\Delta t$ is clamped to 50 ms (max 9 px). This prevents avatars from teleporting through solid walls when refocusing.
- **Diagonal Velocity Normalization:** When holding two keys simultaneously (e.g. W + D), raw vectors produce $\sqrt{1^2 + 1^2} \approx 1.414\times$ speed. Vectors are scaled by $0.7071$ ($\frac{1}{\sqrt{2}}$) to maintain constant walking speed in all 8 directions.
- **Wall Sliding Physics:** X and Y axis collisions are evaluated independently:
  ```js
  if (!checkCollision(nextX, playerRef.current.y, map)) playerRef.current.x = nextX;
  if (!checkCollision(playerRef.current.x, nextY, map)) playerRef.current.y = nextY;
  ```
  If a player walks diagonally into a wall, the blocked axis stops while the free axis glides smoothly along the wall surface.
- **Window Blur Protection:** Attached a `window.blur` listener that resets all pressed keys to `false` when clicking away, eliminating the common "character walks forever" bug.

### C. Tiled Map Engine & Affine Matrix Rendering
- **Map Dimensions:** Custom 35×25 Tiled blueprint (`office.json`), expandable up to the generated 110×80 multi-room campus ($3520 \times 2560\text{ px}$).
- **Tile Size:** Standardized $32 \times 32\text{ px}$ pixel art sourced from LimeZu Modern Interiors under free non-commercial license (`CREDITS.md`).
- **Affine Transformation Matrix:** Tiled encodes flipped and rotated tiles using the highest 3 bits of a 32-bit integer:
  - `0x80000000` (Horizontal flip)
  - `0x40000000` (Vertical flip)
  - `0x20000000` (Diagonal flip / 90° rotation)
  
  My loader extracts these flags using bitwise masking (`rawTileId & 0x1FFFFFFF`) and calculates an affine 2D transformation matrix:
  ```js
  ctx.save();
  ctx.translate(screenX + tileSize / 2, screenY + tileSize / 2);
  ctx.transform(a, b, c, d, 0, 0);
  ctx.drawImage(tileset.img, srcX, srcY, tw, th, -tw/2, -th/2, tw, th);
  ctx.restore();
  ```
  This renders rotated sofas, corner carpets, and angled walls without visual artifacts.
- **View Culling:** Tiles whose coordinates lie completely outside the camera's bounding box are discarded before reaching `ctx.drawImage`.

### D. Network Throttling & Exponential Interpolation (Lerp)
- **10 Hz Throttling (`MOVE_SEND_HZ = 10`):** Sending network packets at 60 FPS would overwhelm the signaling server. Positions are dispatched at most once every 100 ms, and **only** when coordinates have changed:
  ```js
  const hasMoved = player.x !== lastSent.x || player.y !== lastSent.y || player.dir !== lastSent.dir;
  if (hasMoved && currentTime - lastSent.time >= 100) {
    net.sendMove({ x: player.x, y: player.y, dir: player.dir });
  }
  ```
- **Exponential Interpolation:** Raw 10 Hz updates cause remote characters to jump every 100 ms. I implemented framerate-independent exponential smoothing:
  $$\text{glide} = 1 - (1 - 0.15)^{\Delta t \cdot 60}$$
  $$\text{pos} = \text{pos} + (\text{targetPos} - \text{pos}) \times \text{glide}$$
  Each frame closes 15% of the remaining gap at 60 FPS, creating fluid, continuous motion.

### E. Autonomous Bot Swarm & Standalone Testing (`fakeNet.js`)
- **Isolation Principle:** In accordance with `AGENTS.md` Rule 3 (*"Every module runs alone with fake data"*), I created `fakeNet.js` and `WorldLab.jsx`.
- **Intelligent Wandering Bots:** Simulates between 1 and 50 concurrent bots (Alex, Sam, Riya, Taylor, etc.). Each bot picks random headings, pauses naturally, and checks collision boundaries with `stepBot` to bounce away from walls instead of escaping the map.
- **Strict Mode Safe:** Designed with explicit unsubscribe handlers (`destroy()`) so React StrictMode double-mounting never duplicates timers or creates ghost bots.

---

## 3. The Complete Office Structure (110×80 Tiles)

The generated production map expands upon my foundational 35×25 blueprint into an executive corporate campus ($3520 \times 2560\text{ px}$):

```
┌──────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   STAGE HALL     │ MEETING ROOM 1  │ MEETING ROOM 2  │ MEETING ROOM 3  │  FOCUS ROOMS    │
│  (All-Hands/Key) │  (6-8 People)   │ ★ ACTIVE FOCUS  │  (6-8 People)   │  (Silent Solo)  │
├──────────────────┼─────────────────┴─────────────────┴─────────────────┼─────────────────┤
│ BREAKOUT PODS    │   WING A             WING B             WING C      │  PHONE BOOTHS   │
│ & COFFEE BAR     │ (Active Tier 1)   (Tier 2 Locked)   (Tier 3 Locked) │  & CASUAL PODS  │
├──────────────────┼─────────────────────────────────────────────────────┼─────────────────┤
│    CAFETERIA     │                  LOBBY & RECEPTION                  │    BOARDROOM    │
│   & TEA POINT    │              (Spawn Point & Elevators)              │  & VIP LOUNGE   │
└──────────────────┴─────────────────────────────────────────────────────┴─────────────────┘
```

### A. Acoustic Zones & Hearing Types
Defined in `server/office/layout.json` and rendered on Canvas:
1. **`open` (Corridors, Cafeteria, Lobby, Lounges):** Standard proximity hearing. Volume decreases with distance ($100\text{ px}$ earshot) and pans stereo left/right.
2. **`private` (Meeting Rooms 1–3, Boardroom, Phone Booths):** Closed acoustic boundary. Everyone inside hears everyone inside at constant full volume ($0.77$). Zero sound leaks out, and no outside noise enters.
3. **`stage` (Stage Hall):** Asymmetric broadcast acoustics. A speaker standing on the stage platform box reaches the entire hall at `AUDIO_MODES.FULL`. Audience members in the seats hear each other via standard distance falloff.
4. **`silent` (Focus Rooms 1 & 2):** Complete privacy. Microphones are muted so individuals can focus without accidental audio triggers.

### B. Tier Expansion System & Dust Sheet Overlays
- **Why It Exists:** To prevent a 15-person company from feeling lost inside a 100-desk warehouse.
- **How It Operates:** The office starts at **Tier 1** with only Neighbourhood A open. Neighbourhoods B, C, and D are draped in semi-transparent canvas dust sheets with brass stanchions and signs:
  - *"Neighbourhood B — Coming soon opens at tier 2"*
  - *"Neighbourhood C — Coming soon opens at tier 3"*
  - *"Neighbourhood D — Coming soon opens at tier 4"*
- **Canvas Enforcement:** The renderer draws the dust sheet pattern, and `isBlockedByOverlay` enforces hard collision boundaries so avatars cannot walk into locked wings until employee headcount automatically promotes the floor tier.

### C. Meeting Room Focus Spotlight (`drawAreaFocus`)
- When an avatar enters a `private` zone (e.g. **Ananya Rao** in Meeting Room 2):
  1. The canvas compositing engine draws a $70\%$ black semi-transparent film over the entire map.
  2. A clear rectangular cutout is cleared directly over the active room.
  3. This provides instant visual confirmation that the user is inside an acoustically sealed room.

### D. Snake Desk Numbering & Department Blocks
- Desks within each neighbourhood are arranged in a **snake layout** (Row 0: left $\to$ right; Row 1: right $\to$ left). Consecutive numbers always physically touch.
- Departments have color-coded badges rendered over their desk pods:
  - 🟦 **Engineering** (`#2f80ed`, desks A-01 to A-08)
  - 🟪 **Design** (`#9b51e0`, desks A-09 to A-12)
  - 🟧 **Marketing** (`#f2994a`, desks A-13 to A-16)
  - 🟩 **Management** (`#27ae60`, desks A-20 to A-25)

---

## 4. Cross-Module Integration (How My Code Connects)

```
                       ┌────────────────────────┐
                       │  Module 3: 2D World    │
                       │     (Anjali - You)     │
                       └───────────┬────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ Module 1: Aryan  │      │ Module 2: Pratik │      │Module 4: Koushik │
│ Signaling/WebRTC │      │ Geospatial / DB  │      │  Spatial Audio   │
└──────────────────┘      └──────────────────┘      └──────────────────┘
```

1. **Connection with Module 1 (Aryan — Signaling & WebRTC):**
   - My engine listens to `net.onPlayersState`, `net.onPlayerJoined`, and `net.onPlayerLeft`.
   - When the local player walks, my loop sends throttled coordinates via `net.sendMove({ x, y, dir })` at $10\text{ Hz}$.
2. **Connection with Module 2 (Pratik — Geospatial Engine):**
   - Pratik’s backend uses MongoDB `$geoWithin` queries across the 66 room polygons in `layout.json` to calculate which room each avatar occupies.
   - My module renders those zone definitions and enforces visual privacy films.
3. **Connection with Module 4 (Koushik — Spatial Audio):**
   - On every animation frame, my canvas invokes the `onFrame` callback:
     ```js
     onFrame({
       self: { id: selfId, x: player.x, y: player.y },
       others: Array.from(others.values()).map(o => ({ id: o.id, x: o.x, y: o.y }))
     });
     ```
   - Koushik’s Web Audio mixer reads these exact $(x, y)$ world coordinates to calculate Euclidean distance, gain attenuation ($0$ to $100\text{ px}$), and stereo pan values ($-1$ to $+1$).

---

## 5. Viva Defense Masterclass (Top 10 Questions & Answers)

### Q1: "Why did you use `useRef` instead of React `useState` for player positions?"
> **Answer:** *"React `useState` triggers component re-renders every time state changes. If we updated positions in state at 60 FPS, React would run virtual DOM reconciliation 60 times a second, causing severe frame drops and UI stutter. Using `useRef` keeps coordinate mutations in memory without triggering re-renders, allowing the HTML5 canvas to repaint at a clean 60 FPS."*

### Q2: "Why does walking diagonally not make your character move faster?"
> **Answer:** *"If you add $+1$ along X and $+1$ along Y, the Pythagorean vector length is $\sqrt{1^2 + 1^2} \approx 1.414$, giving a $41\%$ speed advantage. In my movement handler, whenever both horizontal and vertical keys are pressed, I multiply both components by $0.7071$ ($\frac{1}{\sqrt{2}}$), which normalizes the velocity vector to exactly $1.0$."*

### Q3: "What is delta-time and why is it clamped to 0.05 seconds?"
> **Answer:** *"Delta-time ($\Delta t$) is the elapsed time between consecutive animation frames. Multiplying walking speed by $\Delta t$ ensures an avatar walks at 180 pixels per second on any monitor refresh rate. We clamp $\Delta t$ to $0.05\text{ s}$ so that if a user switches browser tabs for a few seconds, the avatar doesn't accumulate a massive time step that would cause it to jump through solid walls upon returning."*

### Q4: "How does wall sliding work in your collision engine?"
> **Answer:** *"Instead of testing the final diagonal point $(x + \Delta x, y + \Delta y)$ all at once, my collision engine tests X and Y independently. If the new X collides with a wall but Y is open, the character’s X position is held while Y continues moving. This lets characters smoothly glide along walls instead of sticking abruptly."*

### Q5: "Why send position packets at 10 Hz instead of 60 Hz?"
> **Answer:** *"Sending WebSocket packets at 60 Hz for multiple players would flood the network and overload the server. 10 Hz ($100\text{ ms}$ interval) reduces network bandwidth by $83\%$. We compensate for the lower packet rate on the client side using exponential interpolation (lerp), which smoothly glides characters between packets so the human eye perceives continuous motion."*

### Q6: "Why are some office wings covered in dust sheets?"
> **Answer:** *"That is our Tier-based floor expansion model. A small team of 15 people would feel isolated in an empty 100-desk floor. We start at Tier 1 with only Neighbourhood A open. As more employees join and fill the floor, the backend promotes the floor to Tier 2, automatically removing the dust sheet from Wing B and unlocking the next 25 desks."*

### Q7: "Why is Meeting Room 2 bright while the rest of the canvas is dark?"
> **Answer:** *"That is our Area Focus effect (`drawAreaFocus`). Meeting Room 2 is a `private` acoustic zone. When someone is inside, our canvas renderer draws a dark cutout film over the exterior map. It gives the user immediate visual confirmation that their microphone is now sealed inside this private room and people outside cannot overhear them."*

### Q8: "How does the canvas handle rotated furniture from Tiled?"
> **Answer:** *"Tiled encodes tile rotations in the top 3 bits of the tile ID. My `drawMap` function extracts these bitwise flags, calculates an affine transformation matrix ($a, b, c, d$), and uses `ctx.transform()` to rotate or flip the tile around its center before stamping it to canvas."*

### Q9: "How does your module help the audio engine determine volume?"
> **Answer:** *"On every animation frame, my canvas executes the `onFrame` callback, delivering the exact $(x, y)$ world coordinates of the local user and all nearby avatars. The audio module uses these coordinates to calculate distance ($d = \sqrt{\Delta x^2 + \Delta y^2}$). If $d \le 100\text{ px}$, it attenuates volume linearly; if the user enters a private room, it switches to constant broadcast volume."*

### Q10: "How do you test your module without running the backend server?"
> **Answer:** *"Following our contract-first design, I created `fakeNet.js` and `WorldLab.jsx`. It simulates the network layer locally with between 1 and 50 autonomous bots that wander, change direction, and respect wall collision boundaries. This allows full verification of physics, rendering, and stress testing in isolation."*

---

## 6. Daily Engineering Log Summary

| Date | Key Milestone Completed | Verification & Proof |
|---|---|---|
| **19 Oct 2026** | Initialized Module 3 workspace; structured directories and npm run scripts | Verified Vite dev server startup |
| **20 Oct 2026** | Integrated 32×32 LimeZu tilesets (`Room_Builder`, `Interiors`) | Confirmed asset licensing in `CREDITS.md` |
| **21 Oct 2026** | Designed 35×25 Tiled orthogonal office map (`office.json`) | Validated 7 layers and corridor widths ($\ge 64\text{ px}$) |
| **22 Oct 2026** | Built map loader & affine transformation matrix for rotated tiles | Rendered rotated sofas and corner desks correctly |
| **23 Oct 2026** | Implemented 60 FPS game loop and `useRef` non-blocking architecture | 0 React re-renders during active movement |
| **24 Oct 2026** | Implemented delta-time movement ($180\text{ px/s}$) with $0.05\text{ s}$ clamping | Tested identical walking speed across 60 Hz and 144 Hz displays |
| **25 Oct 2026** | Added diagonal normalization ($0.7071$) and axis-separated wall sliding | Avatars glide smoothly along perimeter walls |
| **26 Oct 2026** | Created autonomous wandering bot simulator (`fakeNet.js`) | Up to 50 bots wandering with obstacle avoidance |
| **27 Oct 2026** | Built exponential lerp interpolation for remote players | Jitter-free motion between 100 ms network packets |
| **28 Oct 2026** | Built standalone test laboratory (`WorldLab.jsx`) with bot sliders | Verified independent module execution at `/?lab=world` |
| **29 Oct 2026** | Added visual earshot radius ring ($100\text{ px}$) and player name badges | Verified visual alignment with audio falloff radius |
| **30 Oct 2026** | Connected `onFrame` upstream callback delivering coordinates to audio | Verified real-time position dispatch to mixer |
| **31 Oct – 2 Nov** | Cleaned up React StrictMode unmount lifecycle and bot destruction | 0 memory leaks or orphaned bot timers |
| **3 Nov – 6 Nov** | Expanded map to 110×80 multi-room layout; integrated acoustic areas | Validated Stage Hall, Meeting Rooms, and Focus Booths |
| **7 Nov – 9 Nov** | Implemented Tier expansion overlays & `drawAreaFocus` room spotlight | Verified visual privacy cutout and dust sheet blocking |
