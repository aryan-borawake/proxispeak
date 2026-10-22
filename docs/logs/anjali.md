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
- Created `WorldCanvas.jsx` with an HTML5 `<canvas>` rendering element and configured `WorldLab.jsx` for isolated testing.
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

## Fri 23 Oct 2026 — Task 4: Office map setup and collision design

**What I built**
- Integrated LimeZu's Modern Interiors 32x32 pixel tilesets (`Room_Builder_free_32x32.png` and `Interiors_free_32x32.png`) into `client/public/maps/`.
- Updated `client/public/assets/CREDITS.md` with source links, author attribution, and non-commercial license documentation.
- Configured Tiled Map Editor with a 32x32 orthogonal grid and embedded tilesets matching our project contract.
- Structured the map layers into `floor`, `furniture`, and `collision` to support our 6 office zones (Lobby, Lounge, Booth, Open Desks, Meeting Room, Stage).

**How it works (in my own words)**
- The office is drawn on an HTML5 Canvas using data from `office.json`, not by creating separate React elements for every wall and desk.
- The `floor` layer paints the ground, the `furniture` layer places interior items, and the `collision` layer acts as an obstacle map.
- In code, collision works by converting pixel coordinates into grid coordinates. Any tile on the `collision` layer with a value greater than 0 blocks walking. We test the X and Y movement separately so the avatar can slide smoothly along walls instead of freezing.

**Problems and how I fixed them**
- Kenney didn't have an asset pack named "Office", so we sourced LimeZu's free Modern Interiors pack which already comes in 32x32 px tiles, perfectly matching our `TILE_SIZE` constant. Added proper attribution to `CREDITS.md`.

**What I learned**
- React only serves as the shell holding `<canvas>`; the actual 60 FPS rendering and movement happen via standard 2D Canvas JavaScript.
- How bounding box collision checks all four corners of a character, and how to set layer opacity in Tiled to easily paint collision barriers over furniture.

**Tomorrow**
- Finish painting the 6 rooms in Tiled, export the completed `office.json`, and verify tileset rendering and wall collision in `map.js`.
