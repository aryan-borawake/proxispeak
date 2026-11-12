# 06 — The 2D world: game loop, movement, camera, drawing

*Code: `client/src/world/WorldCanvas.jsx`, `map.js`, `fakeNet.js`, `WorldLab.jsx`, `officeOverlay.js`, `areas.js`, `soundWalls.js`; the map `client/public/maps/office.json` (generated) and `office-base.json` / `office.tmx` (the original).*

---

## 0. Who built what

The world module is **Anjali's** (Person 3). From the git history and the file comments:

| Built by Anjali (Weeks 1–2) | Extended later by Aryan (v5, v6, 12 Nov) |
|---|---|
| `WorldCanvas.jsx`: the canvas component and the `requestAnimationFrame` game loop | `fill` mode (full-screen office), mouse-wheel and button zoom 0.3×–3× |
| Keyboard movement (arrows / WASD), diagonal normalisation (× 0.7071), clearing stuck keys on window blur | Camera that always follows smoothly; whole-pixel shifts so pixel art stays sharp |
| Delta-time movement (originally 180 px/s) and the frame-rate-independent glide for other players | Shift to run (440 px/s), speed lines; walk speed raised to 220 px/s as a shared constant |
| The FPS counter fix (two separate clocks, see section 7) and the debug earshot ring | The office FPS badge (F key, "FPS 140 · 52 people") |
| `map.js`: loading a Tiled JSON with embedded tilesets, flipped/rotated tiles, collision with wall sliding, the "accidental floor tile" fix (tiles 926 and 192) | `renderMapToCanvas` (draw the map once to a hidden canvas), collision on every `collision`/`walls` layer, `loadOfficeMap` accepting a map object |
| `fakeNet.js`: wandering bots that respect walls, with the same functions as the real `net` | v6 no-op functions on `fakeNet` (chat, layout) so `WorldCanvas` can't tell the difference |
| The original 35 × 25-tile office in Tiled (`office.tmx`, exported to `office-base.json`) with the LimeZu tilesets and `CREDITS.md` | The generated 110 × 80 office (`server/scripts/office-map/`), reusing her meeting table, reception desk, sofas, wall colour and floor (README §7) |
| Whole-map view for small maps; `WorldLab.jsx` test page | `officeOverlay.js` (department outlines, closed "coming soon" neighbourhoods, labels, elevator, desk pulse, name tags), `areas.js` (area highlight film), `soundWalls.js` (wall grid for muffling) |

Every v5/v6 prop is optional, so `?lab=world` (WorldLab) still works the way Anjali built it.

---

## 1. The game loop

A **game loop** is code that runs again and again, once per screen frame: read input, update positions, draw. **`requestAnimationFrame(fn)`** asks the browser to call `fn` just before it paints the next frame, usually 60 times a second (the screen's refresh rate). It also pauses when the tab is hidden, which saves battery.

One frame of `WorldCanvas`, in order (`render` in the main `useEffect`):

1. **Delta time**: seconds since the last frame, capped (section 2).
2. **FPS**: count frames; once a second turn the count into frames per second.
3. **Keys → movement**, with collision and wall sliding (section 3).
4. **Send my position** if I moved and 100 ms have passed (`MOVE_SEND_HZ` = 10).
5. **Glide other players** towards their latest server positions.
6. **Camera**: glide towards me; compute the zoom and the screen shift (section 4).
7. **Draw the map**: one `drawImage` of the pre-rendered map (section 5).
8. **Office layer**: department outlines, closed neighbourhoods, elevator, desk pulse.
9. **Avatars**: everyone else, then me on top (speed lines if running).
10. **Area film**: if I'm in a private, silent or stage area, dim everything else; tell the page when my area changes.
11. **Screen-space text**: labels, name tags, FPS badge (same size at every zoom).
12. **Report to the mixer**: `onFrame({ self, others: [{ id, x, y, blocked }] })` (see `05-audio.md`).
13. `requestAnimationFrame(render)` again.

Why the 60 FPS values are in **refs** and not React state: a **ref** (`useRef`) is a box that holds a value without making React redraw the page. Positions, keys, the camera and the FPS change every frame; putting them in `useState` would make React re-render the whole component 60 times a second. The page is only told about rare changes (zoom changed, area changed, near the elevator).

---

## 2. Delta time

Example: on a 60 Hz screen a frame lasts about 0.0167 s. Walking speed 220 px/s → `220 × 0.0167 ≈ 3.7 px` per frame. On a 144 Hz screen a frame is 0.0069 s → `≈ 1.5 px` per frame. Both walk 220 px in one second.

**Delta time** is the time since the previous frame. Moving `speed × deltaTime` (not a fixed number of pixels per frame) makes the walking speed the same on every screen.

```js
// client/src/world/WorldCanvas.jsx
const rawDeltaSec = (currentTime - lastFrameTime) / 1000;
const deltaSec = Math.min(Math.max(rawDeltaSec, 0), MAX_DELTA_SEC); // MAX_DELTA_SEC = 0.05
```

The cap: if the tab was in the background for 2 s, the next frame's delta would be 2 s and the avatar would jump 440 px in one step, maybe through a wall. Capped at 0.05 s, the biggest step is 11 px walking (22 px running), smaller than a 32 px tile.

The same idea makes the **glide** of other players frame-rate independent: "close 15 % of the gap per 1/60 s" becomes `glide = 1 − 0.85^(deltaSec × 60)`. At 60 FPS that is 0.15 per frame; at 144 FPS about 0.066 per frame, which adds up to the same speed.

Diagonal: pressing up and right gives `(dx, dy) = (1, −1)`, length 1.41. Multiplying both by 0.7071 makes the length 1, so diagonal walking isn't 41 % faster.

---

## 3. Collision and wall sliding

Example: Riya walks diagonally up-right into a wall above her. The upward step is blocked, but the rightward step is free, so she slides along the wall instead of stopping dead.

```js
// client/src/world/WorldCanvas.jsx
if (!isBlocked(nextX, playerRef.current.y)) playerRef.current.x = nextX;
if (!isBlocked(playerRef.current.x, nextY)) playerRef.current.y = nextY;
```

1. Try the x step alone; keep it if the new spot is free.
2. Then try the y step alone from wherever x ended up.

`isBlocked(x, y)` = `checkCollision` (map) **or** `isBlockedByOverlay` (closed neighbourhoods).

`checkCollision` (`map.js`) tests four points of a small "feet" box inside the 24 px avatar: `(x+4, y+8)`, `(x+20, y+8)`, `(x+4, y+24)`, `(x+20, y+24)`. For each point: which tile is it on (`Math.floor(px / 32)`)? Outside the map → blocked. Any non-zero tile on a `collision` or `walls` layer → blocked (except tiles 926 and 192, floor tiles the original map had put on the wall layer by mistake; Anjali found this "doorway trap").

The generated map has an invisible `collision` layer (1 = blocked) plus the `walls` layer.

The server does not repeat the wall check. It checks bounds (0…4096), closed wings and speed (see `02-signaling-and-tick.md`). With the speed cap, a modified browser could still walk through a thin wall at running speed; it could not teleport.

---

## 4. Camera follow and zoom

The map is 3520 × 2560 px, bigger than any screen, so a **camera** decides which part is shown and how big.

Follow: each frame the camera's centre glides 12 % of the way (at 60 FPS, time-based like the player glide) towards the middle of my avatar. Walking feels smooth; a jump (Ctrl+D to my desk) becomes a quick slide.

Zoom: `camera.zoom` from 0.3 (the whole floor on a laptop screen) to 3. The + / − buttons multiply or divide by 1.25; each mouse-wheel notch by 1.1. The office starts at 1.5.

Drawing with the camera, in two "spaces":

```js
const shiftX = Math.round(canvas.width / 2 - camera.x * zoom);
const shiftY = Math.round(canvas.height / 2 - camera.y * zoom);
const useWorldSpace = () => ctx.setTransform(zoom, 0, 0, zoom, shiftX, shiftY);
const useScreenSpace = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
```

- **World space**: the canvas is scaled by `zoom` and shifted, so the code draws the map and avatars in map pixels.
- **Screen space**: no scaling, for text (labels, name tags, FPS) so it keeps the same size at every zoom.
- `Math.round` on the shift and `imageSmoothingEnabled = false` keep the pixel art crisp: a shift of half a pixel would blur every tile.

Example: canvas 1200 px wide, camera at x = 1650, zoom 1.5 → `shiftX = round(600 − 2475) = −1875`. The map point 1650 lands at `1650 × 1.5 − 1875 = 600`, the centre of the canvas.

Small maps (≤ 1600 × 1200 px, not in fill mode, like Anjali's original 1120 × 800 office) are shown whole, camera fixed, zoom 1.

---

## 5. Drawing the static map once

The map has about 8800 tiles per layer (110 × 80) and several layers. Drawing each tile every frame means tens of thousands of `drawImage` calls 60 times a second.

So the map is drawn **once**, when it loads, onto a hidden canvas:

```js
// client/src/world/map.js
export function renderMapToCanvas(map) {
  const canvas = document.createElement('canvas');
  canvas.width = map.width * map.tileSize;   // 3520
  canvas.height = map.height * map.tileSize; // 2560
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawMap(ctx, map, { x: 0, y: 0 });
  return canvas;
}
```

Each frame then does one `ctx.drawImage(mapCanvas, 0, 0)` in world space. The same happens for the wall grid (`buildWallGrid`, once per map). Tileset images are loaded once before the loop starts (`loadOfficeMap` waits for every image).

This follows the project's performance rule (AGENTS.md §7): no heavy work inside the render loop; load images and maps once.

Where the map comes from: the office asks `GET /api/rooms/:floorId` (the floor's stored layout) and passes it as `mapData`; if that fails it falls back to `/maps/office.json`. On `layout:update` the page loads it again. The tileset pictures always come from `/maps/`.

---

## 6. Other players

1. `players:state` arrives 10 times a second. For each other player, store the new position as a **target** (`targetX`, `targetY`); a new player is added at their position.
2. Every frame, each avatar glides towards its target (section 2).
3. `player:left` removes them.

This is **interpolation**: moving smoothly between known positions so 10 updates a second look like 60 frames of motion. Ours is the simple kind: an exponential glide towards the latest position. The server sends a timestamp `t` with every `players:state`, but the world does not use it today (timestamp-based interpolation, which plays positions slightly in the past at their real times, would be smoother under jittery networks; not built).

My own avatar is never overwritten by `players:state`: my browser is the source of my position.

---

## 7. The FPS counter

**FPS** (frames per second) counts how many times the loop ran in the last second.

```js
frameCount++;
const msSinceFpsUpdate = currentTime - lastFpsUpdateTime;
if (msSinceFpsUpdate >= 1000) {
  fps = Math.round((frameCount * 1000) / msSinceFpsUpdate); // e.g. 58 frames in 1004 ms → 58
  frameCount = 0;
  lastFpsUpdateTime = currentTime;
}
```

Two separate clocks: `lastFrameTime` (for delta time, updated every frame) and `lastFpsUpdateTime` (for the FPS number, updated once a second). An earlier version used one variable for both and overwrote it every frame, so "a second has passed" was never true and the counter stayed at 60 forever. Anjali's fix commit (`f934c8e`) introduced the two clocks.

In the office, press **F**: a badge shows `FPS 140 · 52 people` (green, red below 50). With the 50-bot packed load test, headless Chrome showed 135–140 FPS (it isn't tied to a 60 Hz screen, so that's headroom); a normal browser draws at the screen's 60 FPS with time to spare (`10-performance.md`).

---

## 8. What the world sends to the mixer

Every frame:

```js
onFrame({
  self: { id: selfId, x: me.x, y: me.y },
  others: [{ id, x, y, blocked }],   // blocked = a wall tile on the straight line between us
});
```

`blocked` is only computed for people within 140 px, and only when both of us are on open floor (inside rooms the server's rules decide). See `05-audio.md`.

`onFrame` must be the same function on every render (`useCallback` in `useVoiceSession.js`), because the game loop's `useEffect` restarts when it changes.

---

## 9. Area highlight and the page callbacks

Each frame the world checks which area my avatar's middle is in (`areaAt` in `client/src/world/areas.js`, a browser copy of the server's rule). Inside a private, silent or stage area, `drawAreaFocus` lays a dark film over the map with the room cut out. When the area changes, `onAreaChange(area | null)` tells the page, which updates the top bar ("Meeting room 2 (6-8) · PRIVATE") and opens the area chat. This is display only; the server decides hearing and chat delivery. See `08-rooms-and-hearing.md`.

Other callbacks: `onZoomChange`, `onNearElevator` (within 56 px of the elevator spot: press E). The page can steer the world through `controllerRef` (`zoomIn`, `zoomOut`, `setZoom`, `locate`, `jumpTo`, `pulseAt`, `getPosition`).

---

## 10. Testing alone with fake data

`createFakeNet({ bots })` returns an object with exactly the same functions as `net`. Its bots wander, change direction every few seconds or when a wall blocks them, and it "broadcasts" their positions every 100 ms like the server. So `?lab=world` runs with no server at all (AGENTS.md rule 3).
