 ## Anjali: Daily Log
 ## 19/10/2026 - Task 1: Project research

**What I built**
- Today I researched about how can I make 2D canvas structure for the project, learning about various technologies I can use to build it. I also designed a base structure of the project explaning what are the structure is needed.

**How it works (in my own words)**
- There are 6 rooms created for the project where:
1. The Lobby:  It is the "spawn point", its a place were every user logged in will be entered.
2. The lounge: Its a sitting area where every user can rest and have normal chat with everyone
3. The booth: It is a private sitting area where anyone can go and have private chats
4. Open Desks:  It is the main employee place were every eployee is setteles into the office at       their place doing work and for communicating they need to be into a specific X-Y range.
5. Metting room: The meeting room is structure for private audios only.
6. Stage: Its a area where you can broadcast to everyone. 

**Tomorrow**
- Form tomorrow i am going to start on working the designing of the office world i have visioned for myself.
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


