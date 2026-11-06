# Log — Anjali (Module 3: 2D World)

**Owner:** Anjali | **Branch:** `anjali` | **Folders:** `client/src/world/`, `client/public/maps/`, `client/public/assets/`

---

## 📌 Work Done Till Now (Week 1 & Week 2 Milestone Summary)

| Date | Task & Milestone | Key Deliverables & Technical Highlights | Status |
|---|---|---|---|
| **19 Oct** | Task 1: Research & Blueprint | Researched canvas architecture and designed office layout with 6 distinct zones (Lobby, Lounge, Booths, Open Desks, Meeting Room, Stage). | ✅ Complete |
| **20 Oct** | Task 2: Canvas & Game Loop | Built `WorldCanvas.jsx` and `WorldLab.jsx`, initialized 60 FPS loop via `requestAnimationFrame`, and added non-rendering `useRef` FPS tracker. | ✅ Complete |
| **21 Oct** | Task 3: Avatar Movement | Added WASD/Arrow listeners, diagonal velocity normalization ($\times 0.7071$), and `window.blur` key reset to prevent infinite walking. | ✅ Complete |
| **22 Oct** | Tasks 3 & 4: Camera & Audio Ring | Camera viewport follow, scaffolded `map.js`, debug `EARSHOT_PX` circle (100 px), and absolute coordinate `onFrame` callback. | ✅ Complete |
| **23 Oct** | Task 4: LimeZu Tileset Integration | Integrated 32×32 Modern Interiors tilesets, documented CC0/licenses in `CREDITS.md`, configured 35×25 Tiled orthogonal map. | ✅ Complete |
| **24 Oct** | Task 4: Upper Office Wing Framing | Built Lobby, Meeting Room, and Stage with 3-tile doorways and multi-layered wall decoration sheets. | ✅ Complete |
| **25 Oct** | Task 4: Lower Office Furnishing | Built Open Desks, Phone Booths, and Lounge; designed walkways ($\ge 64$ px) aligned with spatial audio constraints. | ✅ Complete |
| **26 Oct** | Tasks 4 & 5: Map Export & FakeNet | Exported `office.json`, solved Tiled rotation/flipping via affine matrix transforms, built `fakeNet.js` with bot wander controls. | ✅ Complete |
| **27 Oct** | Tasks 5 & 6: Collision & Bots | Diagnosed doorway collision trap (carpet tile #926), added wall sliding, and implemented smooth linear interpolation (lerp). | ✅ Complete |
| **28 Oct** | Tasks 6 & 7: Physics & Lifetime Fix | Added bot wall collision, delta-time speed physics ($180\text{ px/s}$), StrictMode lifecycle fix in `useEffect`, and whole-map view. | ✅ Complete |
| **29 Oct** | Tasks 7 & 8: Multi-Module Integration | Verified `onFrame` with Person 4's mixer, tested 10 Hz `net.sendMove` with Person 1, validated 100 px audio falloff radius. | ✅ Complete |
| **30 Oct** | Task 9: Sprite Sheet Pipeline | Researched 32×48 character walk cycles, designed 9-argument `ctx.drawImage` slicing, tested 50 bots at steady 60 FPS in Chrome DevTools. | ✅ Complete |
| **31 Oct** | Tasks 9 & 10: Badge Styling & Mid Freeze | Added rounded name badge pills, baseline alignment, 2.5D depth offset, and achieved Mid Review code freeze. | ✅ Complete |
| **1 Nov** | Week 3: Zones & Raycasting | Designed `zones` layer metadata specs, acoustic space rules, and Bresenham line-of-sight raycasting architecture. | ✅ Complete |
| **2 Nov** | Week 3: Zones Layer & Detection | Integrated zone coordinates, AABB zone detection (`getZoneAt`), UI zone tags, and prepared handoff for Person 2. | ✅ Complete |
| **3 Nov** | Week 3: Line-of-Sight Raycast | Built `lineOfSight.js` raymarching to detect wall barriers between avatars and pass `blocked` to spatial audio. | ✅ Complete |
| **4 Nov** | Week 3: Integration #5 | Verified zones and audio occlusion with team; tested Stage broadcast mode and Meeting Room privacy. | ✅ Complete |
| **5 Nov** | Week 4: Offscreen Canvas Caching | Pre-rendered 1,500+ static tiles to an offscreen canvas, slashing per-frame map draw time from 4.5ms to 0.2ms. | ✅ Complete |
| **6 Nov** | Week 4: Idle Animation & Deployment | Added sine-wave idle bobbing, stage spotlight effects, verified production build, and prepared Render deploy. | ✅ Complete |

---

## Mon 19 Oct 2026 — Task 1: Project research & office architecture design

**What I built**
- Researched 2D HTML5 canvas rendering architectures and state management techniques for top-down browser games.
- Designed the architectural layout for our virtual office, structuring 6 functional zones to match our spatial audio requirements.

**How it works (in my own words)**
- The office is divided into 6 distinct zones:
  1. **The Lobby:** The initial spawn point where every connected user enters the virtual office.
  2. **The Lounge:** A relaxed seating area designed for casual, open-ended team conversations.
  3. **The Phone Booths:** Individual private cubicles designed for focused, confidential 1-on-1 audio chats.
  4. **Open Desks:** The central workstation pods where team members work; avatars must be within 100 px (`EARSHOT_PX`) to communicate.
  5. **Meeting Room:** A dedicated conference space structured for focused group audio discussions.
  6. **Stage:** A broadcast area configured for all-hands presentations to the entire office.

**Tomorrow**
- Begin coding `WorldCanvas.jsx` and implement the 60 FPS requestAnimationFrame game loop.
---

## Tue 20 Oct 2026 — Task 2: Canvas component & game loop with FPS counter

**What I built**
- Created `WorldCanvas.jsx` with an HTML5 rendering element and configured `WorldLab.jsx` for isolated testing.
- Built a 60 FPS game loop using `requestAnimationFrame`.
- Added an on-screen FPS tracker in the corner to measure rendering performance.

**How it works (in my own words)**
- `requestAnimationFrame` tells the browser to run our redraw code right before the screen refreshes (60 times a second). It automatically pauses if the user switches tabs, saving computer memory and battery.
- Instead of keeping the FPS number in React state (`useState`), we store it in a ref (`useRef`). If we used state, React would trigger a full re-render 60 times a second, which would make the entire page lag.

**Problems and how I fixed them**
- Initially thought about using `setInterval` or React state, but learned that `setInterval` does not sync with screen refresh rates and causes stutter. Used `requestAnimationFrame` with delta time calculation instead.

**What I learned**
- The difference between React state and refs, and why game loops inside React components must use `useRef` for high-frequency updates.

**Tomorrow**
- Add keyboard event listeners so the user can walk a character across the canvas using Arrow keys or WASD.
---

## Wed 21 Oct 2026 — Task 3: Keyboard avatar movement & diagonal normalization

- Added keyboard listeners (`keydown`, `keyup`) to track movement via Arrow keys and WASD.
- Programmed avatar position updates on each frame to move the character smoothly.
- Implemented diagonal speed normalization (multiplying diagonal vectors by 0.7071).
- Added a window `blur` event listener to prevent keys from getting stuck.

**How it works (in my own words)**
- When a user presses both Up and Right at the same time, Pythagoras' theorem means they would move $\sqrt{1^2 + 1^2} \approx 1.414$ times faster than normal. Multiplying diagonal speed by $0.7071$ ($1/\sqrt{2}$) keeps the walking speed identical in all 8 directions.
- When you click away to another window, the browser fails to fire `keyup`. Adding a `blur` listener resets all held keys so the avatar stops immediately instead of walking forever.

**Problems and how I fixed them**
- The character kept running indefinitely whenever I switched browser windows. Fixed it by adding `window.addEventListener('blur', handleBlur)` to clear all pressed keys.

**What I learned**
- How vector normalization works in 2D games, and how to handle browser focus and blur edge cases.

**Tomorrow**
- Add camera viewport centering and prepare map loading and collision structure.
---

## Thu 22 Oct 2026 — Task 3/4: Camera viewport centering & map foundation

**What I built**
- Implemented camera centering logic in `WorldCanvas.jsx` to keep the avatar in the middle of the screen (`camera.x = player.x - canvas.width / 2`).
- Scaffolded `map.js` for loading map metadata and calculating tile collision coordinates.
- Added a debug overlay rendering an `EARSHOT_PX` circle (100 px radius) around the avatar for Person 4's spatial audio mixer.
- Wired the `onFrame` callback to send local coordinates upstream on every frame.

**How it works (in my own words)**
- The camera offsets world coordinates into screen coordinates (`renderX = player.x - camera.x`). When the character walks, the camera follows them so the canvas scrolls smoothly over a larger office map.
- The 100px blue circle visually represents the hearing distance defined in `shared/constants.js`. When another player is inside this circle, WebRTC voice audio connects.

**Problems and how I fixed them**
- Made sure that positions reported to `onFrame` are absolute world coordinates, not screen/camera coordinates, so Person 4's mixer calculates true spatial distance accurately.

**What I learned**
- How camera viewport transformations work by subtracting camera offset from world coordinates.

**Tomorrow**
- Find free office tileset assets and configure Tiled map editor for our 6 office zones.
---

## Fri 23 Oct 2026 — Task 4: Office map setup and Tiled layout design

**What I built**
- Integrated LimeZu's Modern Interiors 32x32 pixel tilesets (`Room_Builder_free_32x32.png` and `Interiors_free_32x32.png`) into `client/public/maps/`.
- Updated `client/public/assets/CREDITS.md` with source links, author attribution, and non-commercial license documentation.
- Created our initial Tiled project `office.tmx` configured with a 35×25 orthogonal grid (32×32 px tile size) and both embedded tilesets.
- Designed the architectural blueprint for our 6 office zones (Lobby spawn area, Open Desks, Meeting Room, Stage, Lounge, and Private Phone Booths).
- Started painting the office floor and walls in Tiled, implementing multi-tile corner selection and directional furniture placement.

**How it works (in my own words)**
- The office is built on a 32×32 pixel grid matching our project's `TILE_SIZE` constant.
- The layout is structured across separate layers: `floor` for the base flooring, `furniture` for walls, desks, and objects, and `collision` for physical barriers. Keeping furniture on a separate layer allows editing walls without erasing the floor underneath.
- When painting walls, selecting a multi-tile block (e.g. 2×2 or 3×3 in the tileset) stamps down complete corner pieces with top edges and vertical wall faces, giving the office realistic top-down depth.
- Spacing between workstation clusters is set to at least 3 tiles (~100 px), ensuring teams at different desk pods remain outside each other's `EARSHOT_PX` hearing range.

**Problems and how I fixed them**
- Kenney didn't have a dedicated "Office" asset pack, so we sourced LimeZu's free Modern Interiors pack which natively provides 32×32 px tiles.
- Learned how to properly construct corners without distorted edges by understanding the 3×3 grid pattern and using pre-drawn directional furniture tiles rather than flipping them upside down.

**What I learned**
- How top-down 2.5D wall height (top ledge + vertical face) creates depth in 2D pixel art.
- How tile rotation (`Z`, `Shift+Z`) and flipping (`X`, `Y`) work in Tiled, and why pre-drawn tiles preserve natural lighting and shadows.
- How spatial audio distance constraints (`EARSHOT_PX = 100`, `DISCONNECT_PX = 140`) dictate corridor widths and desk cluster spacing.

**Tomorrow**
- Finish painting furniture and doors for all 6 rooms, paint the `collision` layer, and export the map as `office.json`.

---

## Sat 24 Oct 2026 — Task 4: Upper office wing construction & multi-layer decoration

**What I built**
- Constructed the upper wing of the office layout (Rows 0 to 9) in `office.tmx` using a 4-layer architecture: `Floor`, `Walls`, `decorations_wall_lobby`, and `decorations 2_wall_lobby`.
- Framed out the structural walls and dividing barriers for the **Lobby** (cols 0–7), the central **Meeting Room** (cols 7–21), and the **Stage** (cols 26–34).
- Built 3-tile wide doorways along the bottom wall (Row 9) for each room to ensure smooth entry and exit.
- Layered vertical wall accents, baseboards, and trims on dedicated decoration layers so they sit seamlessly over the wall surfaces.

**How it works (in my own words)**
- Each cell on a tile layer can only store a single tile ID. To place trims, baseboards, or hanging objects on a wall without replacing the underlying wall graphic, we stack separate decoration layers on top.
- Doorways are designed with 3 empty tiles so avatars have plenty of clearance and do not snag on wall collision boundaries when walking in and out.
- The `Floor` layer remains locked to protect the base ground tiles from accidental modification while editing upper layers.

**Problems and how I fixed them**
- Encountered how tile overwriting works when trying to place decorative trims over walls; solved this by introducing dedicated decoration layers stacked above `Walls`.
- Handled layer switching to erase test strokes with the Eraser tool (`E`) without disturbing the locked floor layer underneath.

**What I learned**
- How multi-layer stacking works in 2D level design to achieve visual depth without flattening assets into a single layer.
- The importance of generous doorway sizing (at least 2–3 tiles) for 2D game navigation.

**Tomorrow**
- Clear out the open floor in the lower half, design the Open Desks, Phone Booths, and Lounge, and paint the solid `collision` layer.

---

## Sun 25 Oct 2026 — Task 4: Lower office furniture placement & room furnishing

**What I built**
- Extended `office.tmx` by adding dedicated furniture and props layers (`furniture_layer_1`, `office_elements_1`, and `Tile Layer 7`).
- Built the layout for the lower office wing: Open Desks workstation pods, private Phone Booths, and the relaxation Lounge area.
- Positioned desks, chairs, laptops, and office plants, ensuring paths between furniture are at least 2 tiles wide (~64 px) so players can walk through without getting stuck.
- Aligned desk clusters with spatial audio limits in mind so colleagues talking at neighboring desks don't accidentally overhear each other unless they walk closer.

**How it works (in my own words)**
- In top-down 2D games, objects that sit on top of each other (like a computer monitor sitting on a desk, or a coffee mug on a table) need their own layer. If we put them on the same layer, the desk tile would get deleted when placing the monitor. By using `furniture_layer_1` for tables/chairs and `office_elements_1` for items on top of them, everything renders in the right order without disappearing.
- We deliberately leave 2–3 empty tiles (~64–96 px) between desk rows. Since our character's collision box will be roughly one tile, narrow 1-tile gaps make moving around feel cramped and frustrating for keyboard controls.

**Problems and how I fixed them**
- Placing chairs behind desks initially caused visual glitches because parts of the desk legs overlapped the chair cushions. Solved this by separating base furniture into layers so desks naturally draw above chair backs where appropriate.
- Sized the lounge and phone booths carefully to make sure private conversation zones have sufficient distance from the noisy open workspace.

**What I learned**
- What "Z-ordering" means in 2D game rendering: layers drawn later appear on top of layers drawn earlier (Floor -> Walls -> Base Furniture -> Prop Elements).
- How level design directly impacts multiplayer gameplay: spacing out desks isn't just about visuals, it prevents WebRTC spatial audio from creating audio clutter between desk pods.

**Tomorrow**
- Paint the solid `collision` layer in Tiled, export the finished map to `client/public/maps/office.json`, and verify collision checking in `map.js`.

---

## Mon 26 Oct 2026 — Tasks 4 & 5: Map export, Tiled rotation fix, and fake network bots

**What I built**
- Exported the complete 35×25 office map from Tiled into `client/public/maps/office.json`.
- Implemented real-time map rendering in `client/src/world/map.js`, preloading all tileset images (`Room_Builder`, `Interiors`, `Interior`) and rendering active layers on the HTML5 canvas.
- Integrated the official Tiled affine transformation matrix in `map.js` to correctly render rotated (`Z`) and flipped (`X`, `Y`) tiles for carpets, sofas, and furniture.
- Diagnosed and fixed a collision bug where floor tiles (#926) on the `Walls` layer trapped the avatar in the Lobby doorway, updating `checkCollision` to ignore floor tile IDs.
- Built `client/src/world/fakeNet.js` simulating the network interface with autonomous wandering bots (Alex, Sam, Riya, Taylor) to test multi-user movement locally.
- Implemented linear interpolation in `WorldCanvas.jsx` so remote characters glide smoothly Partway between 100 ms network ticks, and added throttled position broadcasting (`MOVE_SEND_HZ = 10` times/sec) via `net.sendMove`.
- Added bot count controls (1, 3, 5, 50 stress test) and an earshot debug circle toggle in `WorldLab.jsx`, and removed the canvas border frame for a clean look.

**How it works (in my own words)**
- Tiled encodes rotation and flip transformations into the highest 3 bits of a tile ID. In code, we extract those flags using bitwise operations and apply a 2D affine transformation matrix (`ctx.transform(a, b, c, d, 0, 0)`) so rotated items appear at the exact orientation painted in Tiled.
- Remote player positions arrive only 10 times a second (`STATE_BROADCAST_MS = 100`). Without smoothing, avatars would teleport in jagged steps. Linear interpolation (lerping) slides their positions a fraction of the distance toward their target on every 60 FPS animation frame, producing a smooth gliding effect.
- `fakeNet.js` mimics the real Socket.io connection by broadcasting `{ t, players }` payloads every 100 ms, allowing full frontend testing without running the backend server.

**Problems and how I fixed them**
- **Trapped in the Lobby:** Floor tile #926 was accidentally placed across the doorway on the `Walls` layer. Because collision checked for any tile $> 0$, the doorway acted like an invisible wall. Updated `checkCollision` to filter out floor tiles and allow passage.
- **Inverted/Distorted Rotated Furniture:** Rotated sofas and lobby carpets appeared backwards due to an inverted rotation order in canvas transforms. Fixed by replacing ad-hoc rotation calls with the standard mathematical affine transformation matrix for Tiled flags.

**What I learned**
- How bitwise flag masking works in tilemap data (`rawTileId & 0x1FFFFFFF`).
- Why linear interpolation (lerp) is essential for online multiplayer games to hide network latency and tick rate gaps.

**Tomorrow**
- Replace placeholder circle avatars with animated character sprite sheets (Task 9) and prepare the 50-bot speed check for integration.

---

## Wed 28 Oct 2026 — Tasks 5, 6 & 7: Bot collisions, framerate independence & whole-map view

**What I built**
- Integrated collision detection into `client/src/world/fakeNet.js` so autonomous wandering bots check `checkCollision` before stepping and turn away from walls.
- Fixed bot freezing on bot count reduction (50 to 1) by emitting `playerLeft` events for all active bots upon calling `destroy()`, and clearing stale peer state in `WorldCanvas.jsx`.
- Resolved the React StrictMode double-mount lifecycle bug in `WorldLab.jsx` by creating the fake network instance inside `useEffect` instead of `useMemo`.
- Converted avatar movement and remote peer interpolation to framerate-independent physics using delta time (`WALK_SPEED_PX_PER_SEC = 180`, `MAX_DELTA_SEC = 0.05`), ensuring identical movement speeds across 60 Hz and 144 Hz displays.
- Implemented responsive whole-map rendering in `WorldCanvas.jsx` to display the entire 35×25 office map ($1120 \times 800$ px) without camera scrolling, and aligned the audio earshot circle to the avatar's head.

**How it works (in my own words)**
- In `fakeNet.js`, bots calculate their desired next step `(nextX, nextY)` and verify it against the loaded `map` with `checkCollision`. If the tile is a wall or boundary, the bot stays in place and immediately chooses a new random wandering angle (`pickNewDirection`). Extra bots (bots 6–50) that spawn with offsets into walls are safely repositioned to walkable desk coordinates.
- When you reduce the bot count from 50 to 1, the old `fakeNet` instance fires `playerLeft` callbacks for all 50 bots before disconnecting, and `WorldCanvas` clears its `othersRef` Map. This immediately removes old bot avatars from the screen instead of leaving them frozen.
- In development mode, React StrictMode mounts, unmounts, and remounts components to detect memory leaks. Creating `fakeNet` inside `useEffect` ensures that cleanup destroys only the unmounted instance, while the active mount manages its own live instance with running timers.
- Instead of moving a fixed 3 pixels per frame, the game loop measures delta time ($\Delta t$) in seconds between animation frames. Walking speed is calculated as $\text{speed} \times \Delta t$ ($180 \text{ px/s} \times 0.0167\text{ s} \approx 3\text{ px}$ at 60 FPS, or $\approx 1.25\text{ px}$ at 144 FPS). If a tab is backgrounded, $\Delta t$ is clamped to 0.05 s to prevent characters from warping through walls.

**Problems and how I fixed them**
- **Bots phasing through walls:** `fakeNet.js` was previously updating positions blindly without loading the office map. Fixed by loading the map via `loadOfficeMap()` and running `checkCollision` inside `stepBot`.
- **Bots freezing when reducing count:** Destroying `fakeNet` previously halted intervals without notifying listeners. Fixed by emitting `cb({ id: b.id })` for all bots before clearing listeners, and clearing `othersRef` in `WorldCanvas.jsx`.
- **Bots not moving on fresh page load:** `useMemo` in `WorldLab.jsx` held onto a dead fakeNet instance after StrictMode's initial cleanup. Switched to `useEffect` with local state `fakeNet`.

**What I learned**
- What delta time clamping means and why game physics must be calculated per second rather than per frame to maintain cross-device consistency.
- How React StrictMode's double-mount cycle affects stateful objects with cleanup methods (`destroy()`), and why `useEffect` is required over `useMemo` for network instances.
- How exponential decay interpolation ($1 - (1 - \alpha)^{\Delta t \cdot 60}$) smooths remote multiplayer positions accurately regardless of screen refresh rate.

**Tomorrow**
- Replace circle avatars with animated character sprite sheets (Task 9) and prepare the 50-bot stress test for integration.

---

## Thu 29 Oct 2026 — Tasks 7 & 8: Group testing & multi-module integration verification

**What I built & tested**
- Participated in our team integration and testing session with Aryan (Signaling/WebRTC), Pratik (Geospatial engine), and Koushik (Spatial audio).
- Tested `WorldCanvas.jsx` with the team to ensure our 2D world satisfies all integration interfaces in `CONTRACTS.md`.
- Verified the `onFrame` callback integration with Person 4's spatial audio mixer, passing real-time coordinate frames (`{ self: { id, x, y }, others: [{ id, x, y, blocked }] }`) on every animation frame.
- Tested the 100 px `EARSHOT_PX` hearing boundary visually against Person 4's audio volume falloff curve, checking that voices fade to silence exactly as avatars step outside the blue circle.
- Validated position broadcasting with Person 1's network contract (`net.sendMove`), confirming positions send at most 10 times a second (`MOVE_SEND_HZ = 10`) and only when moving.
- Ran multi-user stress tests with 5, 10, and 50 bots in `WorldLab.jsx`, confirming consistent 60 FPS rendering and smooth exponential interpolation across different laptops.

**How it works (in my own words)**
- During our group test, we checked how the four pieces fit together into one experience:
  1. As I walk using Arrow keys or WASD, `WorldCanvas` updates my character's position using delta-time physics and checks wall collisions against `office.json`.
  2. If I moved, `WorldCanvas` calls `net.sendMove({ x, y, dir })` at 10 Hz to notify the server.
  3. Every 60 FPS animation frame, `WorldCanvas` invokes the `onFrame` callback, handing `{ self, others }` world coordinates to Person 4's audio engine.
  4. Person 4's mixer calculates the distance (`Math.hypot(dx, dy)`). When distance is within 100 px (`EARSHOT_PX`), volume scales up; when an avatar moves to my right (`dx > 0`), sound pans to my right ear (`dxToPan`).
  5. As other players or bots move, their positions arrive every 100 ms (`PLAYERS_STATE`). Our exponential glide formula (`1 - (1 - 0.15)^(deltaSec * 60)`) slides them smoothly across the canvas without stutter.

**Problems and how I fixed them**
- **Contract coordinate mismatch:** We verified whether `onFrame` should send raw world coordinates or screen coordinates. Screen coordinates subtract camera offset (`renderX = x - camera.x`), which would break Person 4's distance formula if the camera scrolled. Confirmed that `onFrame` always outputs absolute world coordinates `(x, y)`.
- **Audio ring visual sync:** Tested the blue `EARSHOT_PX` radius circle with Koushik. Confirmed that centering the circle at `(renderX + 16, renderY + 10)` (the avatar's head/ears) matches the exact distance where WebRTC audio becomes audible.
- **Laptop refresh rate differences:** During group testing on different screens (a 60 Hz display and a 144 Hz display), our yesterday's delta-time fix proved successful—characters moved across the room at the exact same physical speed on both machines.

**What I learned**
- What "contract-first development" means in practice: by agreeing on event names and coordinate formats in `CONTRACTS.md` on Day 1, all 4 modules could be tested together without breaking each other's code.
- How the 2D world visual layer acts as the single source of truth for spatial audio: WebRTC handles the voice streams, but the canvas coordinates dictate who hears whom and from which direction.
- How multi-user stress testing reveals edge cases in framerate and memory management.

**Tomorrow**
- Begin integrating animated character sprite sheets (Task 9) to replace the temporary circle avatars with walking character animations.

---

## Fri 30 Oct 2026 — Task 9: Character sprite sheets & walking animation architecture

**What I built**
- Researched and prepared 32×48 pixel animated character sprite sheets compatible with our LimeZu 32×32 modern office tileset.
- Designed the sprite animation slicing architecture to replace the placeholder green and blue circles with multi-directional walking character avatars.
- Structured direction-based sprite row mapping so avatars face the correct orientation (`down`, `up`, `left`, `right`) based on user input and velocity.
- Built an animation frame cycle timer so moving characters cycle smoothly through walking strides and snap to an idle standing pose when stationary.
- Conducted the 50-bot stress test in Chrome DevTools Performance tab for our Mid Review milestone, confirming the canvas maintains a rock-solid 58–60 FPS even with 50 active avatars rendering simultaneously.

**How it works (in my own words)**
- A **sprite sheet** is a single image file packed with a grid of animation frames. Instead of loading dozens of separate image files over the network, the browser loads one image once.
- To animate a character, we use the 9-argument version of HTML5 canvas `ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`. The `s` parameters (source) define the clipping rectangle on the sprite sheet (e.g. frame 0, 1, 2, or 3 for walking), while the `d` parameters (destination) place and scale the cropped character at the avatar's `(x, y)` position in the office.
- Each row of the sprite sheet corresponds to one facing direction (`down = row 0`, `up = row 1`, `left = row 2`, `right = row 3`), and columns represent animation steps (`idle`, `step left`, `idle`, `step right`).
- When the player holds a movement key, a frame counter increments based on elapsed delta time ($\Delta t$). Every 120 ms, it advances to the next animation frame, creating a natural walking stride. When movement stops, the frame immediately resets to frame 0 (neutral standing pose).
- For remote peers and bots, their animation frame advances whenever their current interpolated position $(x, y)$ is actively sliding toward their target $(targetX, targetY)$.

**Problems and how I fixed them**
- **Blurry pixel art on high-DPI displays:** When the browser scales pixel art characters, it applies anti-aliasing (bilinear filtering), making 32px sprites look blurry and smudged. Fixed by enforcing `ctx.imageSmoothingEnabled = false` on the canvas rendering context, keeping crisp retro pixel art.
- **Direction jitter when stopped:** When releasing keys diagonally, the last detected direction sometimes flickered between two orientations. Fixed by preserving the last valid direction in a ref when velocity drops to zero.
- **Asset alignment with tile grid:** Characters in 32×48 dimensions are taller than a single 32×32 floor tile. To make their feet align naturally with the floor tile beneath them, we offset the drawing destination vertically by -16 px (`renderY - 16`), ensuring feet stand on the tile and heads overlap the wall/tile above them naturally (creating 2.5D visual depth).

**What I learned**
- What sprite frame slicing (`sx`, `sy`, `sw`, `sh`) means in 2D game development and how `drawImage` works like a stencil over a sprite sheet.
- How top-down perspective sorting works: drawing characters taller than the tile size gives a sense of height and vertical depth in top-down 2D worlds.
- Why disabling image smoothing (`imageSmoothingEnabled = false`) is essential for pixel art games.

**Tomorrow**
- Finalize sprite sheet integration in code, draw player name badges above avatars with rounded background tags, and prepare the mid-review demo presentation.

---

## Sat 31 Oct 2026 — Tasks 9 & 10: Avatar badge styling, sprite pipeline & mid review freeze

**What I built**
- Designed and added rounded pill name badges for avatars in `WorldCanvas.jsx` to improve text legibility against complex floor tiles and furniture.
- Centered the player and peer name badges using canvas text metrics (`ctx.measureText(name)`) and styled them with dark semi-transparent backgrounds and rounded corners.
- Tested the 2.5D visual depth sorting rule: characters are rendered with their feet on the current tile while their upper body (-16 px vertical offset) naturally layers in front of or behind objects.
- Conducted the Week 2 Mid-Review code freeze check with the team, verifying that 2D world movement, wall collision, interpolation, and spatial audio frame reporting (`onFrame`) are stable with zero console warnings.
- Compiled our milestone summary table and viva study notes reviewing our first two weeks of development.

**How it works (in my own words)**
- Drawing raw text directly onto a detailed canvas makes names hard to read when characters walk across busy patterns (like colorful carpets, plants, or wooden desks). A **name badge pill** solves this:
  1. We measure the text's physical pixel width using `ctx.measureText(name).width`.
  2. We draw a dark semi-transparent rectangle (`rgba(15, 23, 42, 0.75)`) with rounded corners centered behind the text, giving it a 6 px horizontal padding and 3 px vertical padding.
  3. Setting `ctx.textAlign = 'center'` and `ctx.textBaseline = 'middle'` places the text right in the middle of the pill regardless of string length.
- For our **Mid Review Freeze**, our module guarantees three core contracts:
  1. **Performance:** The canvas draws at 60 FPS using `requestAnimationFrame`, with delta-time clamping (`MAX_DELTA_SEC = 0.05`) ensuring smooth movement across all screen refresh rates.
  2. **Interactivity:** WASD and Arrow key controls support 8-direction walking with diagonal speed normalization ($\times 0.7071$) and tile-based wall collision with sliding.
  3. **Multiplayer & Audio integration:** Remote peers glide smoothly via exponential decay interpolation, and every frame reports exact world coordinates to Person 4's spatial audio mixer via `onFrame`.

**Problems and how I fixed them**
- **Badge text jumping on different browsers:** Different browsers handle default canvas font baselines slightly differently, causing text to look slightly off-center. Explicitly setting `ctx.textBaseline = 'middle'` and centering on the badge's Y coordinate resolved the alignment inconsistencies.
- **Top-wall badge clipping:** When a player walks to the top border of the office (Row 0), their name tag positioned above their head could be cut off by the canvas boundary. Added clamping (`Math.max(12, badgeY)`) so badges stay comfortably visible within the canvas viewport.

**What I learned**
- How to measure and render dynamic UI overlays on a 2D HTML5 canvas without using heavy HTML DOM elements over the canvas.
- What a "Code Freeze" means in engineering: locking new feature development before a milestone review so the entire team can test a stable, predictable version of the codebase.
- How to summarize and explain technical decisions clearly for our upcoming oral viva.

**Tomorrow**
- Begin Week 3: study zone definitions (`zones` layer in Tiled: Meeting Room, Lounge, Booths, Stage) to prepare handoff for Person 2's geospatial engine and Person 4's zone acoustic filters.

---

## Sun 1 Nov 2026 — Week 3: Office zones layer setup & metadata handoff architecture

**What I built**
- Commenced Week 3 development focusing on office zone architecture and acoustic space segmentation.
- Designed the `zones` layer specifications in Tiled for our 35×25 office map according to `CONTRACTS.md` (`ZONE_TYPES`: `open`, `private`, `silent`, `stage`, `lobby`).
- Structured zone metadata boundaries for all 6 rooms:
  1. Lobby (`lobby` zone)
  2. Meeting Room (`private` zone)
  3. Phone Booths (`silent` zone)
  4. Open Desks (`open` zone)
  5. Lounge (`open` zone)
  6. Stage (`stage` zone)
- Researched zone rendering on HTML5 canvas: semi-transparent colored tints (`rgba(...)`) with subtle dashed boundary outlines and room name labels.
- Researched the 2D Line-of-Sight algorithm (`lineOfSight.js`) using grid-based raycasting to detect whether a straight line between two players intersects a solid wall tile on the `Walls` layer.

**How it works (in my own words)**
- A **zone** in our virtual office is a defined 2D rectangular area on the map with specific acoustic and communication rules:
  - In an `open` zone (like Open Desks), volume falls off with distance (`AUDIO_MODES.FALLOFF`).
  - In a `private` zone (like the Meeting Room), voices cannot leak out to people outside the room, and outside noise cannot enter.
  - In a `stage` zone, the speaker's voice broadcasts at full volume (`AUDIO_MODES.FULL`) to everyone in the room.
- In Tiled, we can define zones either as an object layer with named bounding boxes or as a tile/data layer. Object layers store `{ x, y, width, height, type }` metadata. When exported into `office.json`, Person 2 (Pratik) reads these exact bounding coordinates to store them in MongoDB for `$geoWithin` queries.
- **Line-of-Sight (Raycasting):** In real life, sound is muffled by solid walls. To calculate whether an obstacle blocks audio, `lineOfSight.js` draws a virtual straight line between Player A $(x_1, y_1)$ and Player B $(x_2, y_2)$, sampling along the line. If any tile contains a solid wall, `blocked` is set to `true` in our `onFrame` callback, allowing Person 4's mixer to apply a low-pass audio filter (muffle).

**Problems and how I fixed them**
- **Overlapping visual clutter:** Drawing solid colored blocks over rooms would obscure our LimeZu floor carpets and desks. Decided to use low opacity fills (`rgba(..., 0.08)`) with clean 1px borders so zones are visually recognizable without compromising the pixel art.
- **Raycasting performance:** Checking every single pixel between two players would be computationally expensive at 60 FPS. By sampling at tile-width intervals (every 32 pixels along the ray), the check requires at most 3 to 4 checks across a 100 px `EARSHOT_PX` distance, keeping execution time well under 0.1 ms per frame.

**What I learned**
- What Bresenham's line algorithm and raycasting mean in 2D grid games, and how grid-based stepping keeps collision and line-of-sight checks fast.
- How spatial audio zones interact with the geospatial engine: the visual world renders the zone boundaries, while the backend geospatial engine enforces room privacy rules.
- How audio occlusion (muffling voices behind walls) enhances spatial realism in proximity voice chat.

**Tomorrow**
- Add the `zones` layer to `office.tmx` in Tiled, re-export `office.json`, update `map.js` to draw zone tints/labels, and coordinate the handoff with Person 2.

---

## Mon 2 Nov 2026 — Week 3: Tiled zones layer integration, visual overlays & zone detection

**What I built**
- Integrated the `zones` definition layer into the 35×25 office map according to `CONTRACTS.md` (`ZONE_TYPES`: `open`, `private`, `silent`, `stage`, `lobby`).
- Configured zone boundaries and coordinates in map metadata:
  1. **Lobby:** cols 0–7, rows 0–9 (`lobby` zone)
  2. **Meeting Room:** cols 8–21, rows 0–9 (`private` zone)
  3. **Stage:** cols 26–34, rows 0–9 (`stage` zone)
  4. **Phone Booths:** cols 0–7, rows 14–24 (`silent` zone)
  5. **Open Desks:** cols 8–24, rows 10–24 (`open` zone)
  6. **Lounge:** cols 25–34, rows 10–24 (`open` zone)
- Added real-time zone detection (`getZoneAt(x, y, map)`) in `client/src/world/map.js` and `WorldCanvas.jsx` to identify which room the player is standing in based on world coordinates.
- Added visual zone badge rendering on the canvas (e.g. displaying current zone badge: "Zone: Meeting Room (Private)") so the user immediately knows their audio status.
- Designed semi-transparent floor tint rendering for active zones and prepared the updated zone coordinates for Person 2 (Pratik) for MongoDB `$geoWithin` queries.

**How it works (in my own words)**
- A zone lookup function (`getZoneAt(x, y)`) takes the avatar's pixel position `(x, y)` and checks which rectangular bounding box `[x, y, width, height]` contains that point. Because tile coordinates are mapped in pixels ($x / 32, y / 32$), checking zone bounds is an $O(1)$ math check ($x \ge \text{zone.x} \text{ and } x < \text{zone.x} + \text{zone.width}$, etc.).
- When an avatar walks across the doorway from the open corridor into the Meeting Room, the system detects a zone transition (`oldZone !== newZone`). This allows the frontend to update audio mode indicators and informs Person 4's mixer whether to apply `AUDIO_MODES.FULL` (Stage) or `AUDIO_MODES.FALLOFF` (Open Desks).
- This fulfills the Week 3 handoff contract: Person 3 provides the exact pixel bounding boxes of every zone so Person 2 can seed them into MongoDB for backend proximity and privacy queries.

**Problems and how I fixed them**
- **Boundary edge jitter at doorways:** When walking right along the doorway boundary between the hallway and Meeting Room, rapid movements could cause zone toggling back and forth. Solved by aligning zone boundaries exactly to the door threshold line inside the doorway so the room transition feels decisive and natural.
- **Visual tint contrast:** Bright color fills on canvas distracted from character visibility. Solved by applying subtle pastel tones (`rgba(59, 130, 246, 0.06)` for Meeting Room, `rgba(168, 85, 247, 0.06)` for Stage, etc.) with rounded corner tags in the UI corner.

**What I learned**
- How point-in-bounding-box geometric detection works in 2D space and why simple AABB (Axis-Aligned Bounding Box) checks are so fast in game loops.
- How frontend zone transitions hook into WebRTC audio states: entering a `private` room signals to only connect with users inside the same zone.
- Why clear UI feedback (like an on-screen zone status tag) is critical for user privacy in virtual offices, so people know when their microphone is private versus broadcast.

**Tomorrow**
- Implement `lineOfSight.js` using grid raycasting to detect whether walls block the direct sound path between two avatars, and pass `blocked: true/false` to Person 4's mixer via `onFrame`.

---

## Tue 3 Nov 2026 — Week 3: Wall line-of-sight raycasting & audio occlusion

**What I built**
- Created `client/src/world/lineOfSight.js` to determine whether a straight line between two avatars crosses a solid wall or partition.
- Implemented a 2D grid raycasting algorithm that samples points along the vector between Player A $(x_1, y_1)$ and Player B $(x_2, y_2)$ at 16 px intervals.
- Wired the raycast check into `WorldCanvas.jsx`'s `onFrame` callback, dynamically calculating `blocked: true` or `blocked: false` for each remote avatar in the `others` array.
- Tested the output with Person 4's spatial audio mixer, verifying that voices correctly muffle when an avatar walks behind a wall.

**How it works (in my own words)**
- In top-down virtual offices, two avatars might stand just 50 px apart on opposite sides of a drywall partition. Without obstacle detection, they would hear each other as if standing in the same open space.
- A **line-of-sight check** (or raycast) shoots an invisible mathematical ray from my avatar's center to the other avatar's center:
  1. We compute the distance: $d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$.
  2. If the distance is greater than `DISCONNECT_PX` (140 px), we immediately skip the math because sound is inaudible anyway.
  3. We step along the line in small increments (every 16 px). At each step, we check the tile on the `Walls` layer (`col = Math.floor(x / 32)`, `row = Math.floor(y / 32)`).
  4. If any sampled tile along the path contains a solid wall, the function returns `true` (sound is blocked).
- Every animation frame, `WorldCanvas` passes this flag inside `onFrame({ self, others })`. Person 4's mixer reads `other.blocked` to engage a low-pass audio filter (cutting frequencies above 800 Hz), producing a realistic muffled voice effect.

**Problems and how I fixed them**
- **Over-calculating line-of-sight for distant players:** In an office with 50 bots, running raycasting for every pair of avatars 60 times a second would require thousands of tile lookups per frame. Fixed by adding an early-exit distance threshold (`if (distance > EARSHOT_PX) return false;`), so raycasting only runs for nearby peers who are actually within hearing range.
- **Ray snagging on doorway corners:** Avatars standing right at an open doorway were sometimes mistakenly flagged as blocked because the ray grazed the edge of the doorway frame. Resolved by inset-padding the avatar collision point by 4 px toward the avatar center.

**What I learned**
- What raymarching / raycasting means in grid-based 2D games and how step intervals determine detection accuracy versus CPU overhead.
- How audio occlusion (sound muffling through obstacles) bridges visual geometry and acoustics.

**Tomorrow**
- Participate in Integration Round #5 with the team to test zone transitions, saved maps, and audio filtering end-to-end.

---

## Wed 4 Nov 2026 — Week 3: Integration Round #5 — Zones, room persistence & audio occlusion

**What I built**
- Participated in Integration Round #5 with Aryan (Signaling), Pratik (Geospatial), and Koushik (Audio).
- Handed off the verified zone bounding box coordinates from `office.json` to Pratik for MongoDB `$geoWithin` queries and room persistence.
- Tested end-to-end audio occlusion with Koushik: verified that walking behind the Meeting Room wall instantly triggers the low-pass filter when `blocked: true`.
- Tested the Stage broadcast zone: confirmed that an avatar stepping onto the Stage (cols 26–34, rows 0–9) triggers `AUDIO_MODES.FULL`, broadcasting their voice across the entire office without distance attenuation.
- Verified that private zones (Meeting Room, Phone Booths) correctly restrict voice chat so users in the corridor cannot overhear confidential discussions.

**How it works (in my own words)**
- Integration Round #5 links the 2D world visual map with backend database queries and Web Audio filters:
  1. As my character walks across the office, `WorldCanvas` detects the active zone via bounding box math (`getZoneAt`).
  2. Pratik's backend geo engine runs `$geoWithin` against the zone polygons in MongoDB, confirming which users belong to the same acoustic room.
  3. Koushik's audio mixer receives `{ self, others }` from our `onFrame` callback every 16 ms. It reads `other.blocked` to muffle audio through walls and switches to full volume whenever the speaker is on stage.
  4. Our canvas renders visual confirmation: a subtle room tint and an on-screen badge displaying `"Zone: Meeting Room (Private)"`.

**Problems and how I fixed them**
- **Rapid zone fluttering at doorway thresholds:** Stepping forward and backward across a doorway caused audio mode flags to toggle repeatedly. Solved by placing the zone boundary 8 px inside the doorway threshold, creating a small hysteresis zone so room transitions feel deliberate.

**What I learned**
- How decoupled micro-modules communicate through clean contracts: the 2D world calculates simple geometry (`(x, y)`, `blocked`), which effortlessly powers both MongoDB spatial queries and Web Audio DSP filters without tight coupling.
- What acoustic hysteresis means in UI and level design: preventing annoying audio chatter at room boundaries.

**Tomorrow**
- Start Week 4 performance optimizations: pre-render static map layers to an offscreen canvas to optimize rendering time for 50 bots.

---

## Thu 5 Nov 2026 — Week 4: Offscreen canvas map caching & 60 FPS performance polish

**What I built**
- Began Week 4 performance optimization and polish for our upcoming Final Review milestone.
- Implemented **Offscreen Canvas Map Caching** in `client/src/world/map.js`: the static office map (Floor, Walls, Furniture, Decorations — totaling over 1,500 tiles) is now pre-rendered once onto an offscreen canvas in memory upon initial map load.
- Updated `drawMap` in the 60 FPS game loop to draw the cached offscreen canvas with a single `ctx.drawImage(offscreenCanvas, 0, 0)` call rather than looping through 6,000+ tile iterations every frame.
- Reduced per-frame map rendering time from ~4.5 ms down to under 0.2 ms, freeing up virtually the entire 16.6 ms frame budget.
- Added visual stage enhancements: added a golden spotlight glow on the Stage when an avatar steps up to present.

**How it works (in my own words)**
- An **offscreen canvas** is an invisible canvas element that exists purely in computer RAM.
- In our old render loop, every single frame (60 times a second), the browser iterated over all 7 layers of our 35×25 map ($35 \times 25 \times 7 = 6,125$ checks), computing affine transformation matrices and calling `ctx.drawImage()` for every individual tile. While modern GPUs handle this, it placed unnecessary CPU load on laptops.
- With offscreen caching:
  1. When `loadOfficeMap()` finishes loading tile images, we create an offscreen canvas of exactly $1120 \times 800\text{ px}$.
  2. We paint all non-moving layers (`Floor`, `Walls`, `decorations`, `furniture_layer_1`, `office_elements_1`) onto this offscreen canvas **just once**.
  3. In our 60 FPS render loop, `drawMap(ctx, map, camera)` simply executes `ctx.drawImage(map.offscreenCanvas, -camera.x, -camera.y)`.
  4. Dynamic elements (avatars, name badge pills, audio radius circle) are drawn directly on top every frame.
- This slashed frame draw times by over 95%, ensuring steady 60 FPS even when rendering 50 moving bots simultaneously.

**Problems and how I fixed them**
- **Dynamic objects trapped on static canvas:** Initially made sure characters and temporary visual effects are never drawn onto the cached offscreen canvas, as anything drawn there becomes permanent wallpaper. Strictly separated static layers (pre-baked once) from dynamic overlays (painted every frame).

**What I learned**
- What offscreen double-buffering (render-to-texture) means in computer graphics and why it is the gold standard for 2D tile engines.
- The concept of a "frame budget": at 60 FPS, you have only 16.6 milliseconds per frame. Spending only 0.2 ms on map rendering leaves 16.4 ms of headroom for networking, audio mixing, and animation smoothing.

**Tomorrow**
- Add idle breathing animations for characters and prepare frontend static deployment checks for the final demo.

---

## Fri 6 Nov 2026 — Week 4: Idle character animation, frontend production build & deployment readiness

**What I built**
- Implemented an idle breathing/bobbing animation cycle for stationary avatars in `WorldCanvas.jsx` using a gentle sine wave formula ($y + \sin(t \times 4) \times 1\text{ px}$), making motionless characters feel alive instead of frozen statues.
- Built the Stage spotlight and speaker active broadcast indicator: when a character enters the Stage zone (`stage`), an animated warm spotlight cone and active speaker halo render beneath their avatar, visually signaling that their microphone is broadcasting in `AUDIO_MODES.FULL`.
- Tested the production build pipeline (`npm run build` in `client/`) to verify that Vite bundles all assets, tilesets, and canvas scripts with zero build errors or broken asset paths.
- Prepared the frontend deployment configuration for Render static site hosting (configuring `dist/`, build command `npm run build`, and single-page app rewrite routing).
- Conducted pre-freeze rehearsals with the team ahead of tomorrow's **Round #6 Final Freeze** (Sat 7 Nov).

**How it works (in my own words)**
- **Idle Animation Sine Wave:** In retro top-down games, a character who completely stops moving can look like the game crashed. Instead of complex sprite swaps for idle state, we apply a subtle vertical float using a sine function:
  $$\Delta y = \sin\left(\frac{\text{currentTime}}{300}\right) \times 1\text{ px}$$
  This subtly shifts the avatar by $\pm 1$ pixel up and down every 1.8 seconds, simulating natural breathing and idle stance with almost zero CPU overhead.
- **Stage Speaker Highlighting:** When `getZoneAt(x, y)` detects that an avatar is inside the Stage zone, we draw an ambient radial gradient spotlight beneath them using `ctx.createRadialGradient()`. This provides visual clarity: anyone standing on stage is visibly "on the mic".
- **Production Build & Render Static Site:** In development, Vite serves files dynamically over `localhost:5173`. For deployment on Render, `npm run build` compiles all JSX, modules, and CSS into minified static bundles in `client/dist/`. Because we use relative public paths for maps and tiles (`/maps/office.json`, `/maps/Room_Builder_free_32x32.png`), the bundled app loads all assets without missing 404 errors.

**Problems and how I fixed them**
- **Sine wave desynchronization among multiple bots:** When 50 bots all breathe at the exact same millisecond, the canvas looks like a synchronized dance routine. Solved by giving each bot a slight random phase offset based on their unique ID (`phase = hash(bot.id)`), making each character's breathing rhythm individual and natural.
- **Vite production asset path resolution:** In production, assets in `public/` must be referenced from the root (`/maps/...`) rather than relative source paths (`../public/...`). Verified that all `fetch()` and `new Image().src` calls use root-relative paths, ensuring seamless loading both locally and on Render.

**What I learned**
- How trigonometric sine waves ($\sin$) are used in game engines for smooth, cyclic animations (breathing, bobbing, pulsing highlights) without needing extra sprite art.
- The difference between development server execution (Vite dev) and compiled static production deployment (Vite build / Render CDN).
- How visual indicators (spotlights, badges) support spatial audio contracts by visually explaining audio modes (`full` vs `falloff`) to users.

**Tomorrow**
- Participate in Round #6 Final Freeze with the team, finalize deployment on Render, and review viva presentation slides.







