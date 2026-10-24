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
- Doorways are designed with 3 empty tiles ($\approx 96\text{ px}$) so avatars have plenty of clearance and do not snag on wall collision boundaries when walking in and out.
- The `Floor` layer remains locked to protect the base ground tiles from accidental modification while editing upper layers.

**Problems and how I fixed them**
- Encountered how tile overwriting works when trying to place decorative trims over walls; solved this by introducing dedicated decoration layers stacked above `Walls`.
- Handled layer switching to erase test strokes with the Eraser tool (`E`) without disturbing the locked floor layer underneath.

**What I learned**
- How multi-layer stacking works in 2D level design to achieve visual depth without flattening assets into a single layer.
- The importance of generous doorway sizing (at least 2–3 tiles) for 2D game navigation.

**Tomorrow**
- Clear out the open floor in the lower half, design the Open Desks, Phone Booths, and Lounge, and paint the solid `collision` layer.
