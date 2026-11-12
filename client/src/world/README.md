# Module 3 — 2D World (Canvas)

**Owner:** Person 3 (Anjali) | **Branch:** `anjali`  
**Folders Owned:** `client/src/world/`, `client/public/maps/`, `client/public/assets/`  
**Test Lab:** [http://localhost:5173/?lab=world](http://localhost:5173/?lab=world)

---

## 1. What This Module Does

The **2D World** module is the visual core of ProxiSpeak. It renders the virtual office on an HTML5 canvas, simulates character walking physics, handles obstacle collisions, and renders remote participants gliding smoothly across the screen.

Every frame, it hands everyone's exact world positions to Person 4's spatial audio engine (`onFrame`), making voices louder as avatars get closer and panning voices between left and right ears.

---

## 2. Work Done Till Now (Week 1 & 2 Milestones)

All core requirements for Weeks 1 and 2 and the **Mid Review Freeze** are fully implemented and verified:

### 🎮 Canvas & Rendering Engine
- **60 FPS Game Loop:** Powered by `requestAnimationFrame` for stutter-free, battery-friendly rendering that automatically suspends when the tab is backgrounded.
- **Non-blocking State:** High-frequency rendering values (positions, camera offsets, FPS, held keys) live in React `useRef` rather than `useState`, completely avoiding 60 Hz React re-render penalties.
- **Accurate Double-Clock FPS Counter:** Two independent timers decouple per-frame delta time measurement from the 1-second FPS display counter.

### 🚶 Movement & Physics
- **Framerate-Independent Delta-Time:** Walking physics run on `WALK_SPEED_PX_PER_SEC = 180` multiplied by elapsed seconds ($\Delta t$). Movement speed is physically identical on 60 Hz, 120 Hz, and 144 Hz displays.
- **Delta-Time Clamping (`MAX_DELTA_SEC = 0.05`):** Restricts the maximum time gap accepted to 50 ms. When switching tabs, avatars cannot jump hundreds of pixels through solid walls upon refocus.
- **8-Directional Movement:** Full WASD and Arrow key navigation. Diagonal velocity vectors are normalized ($\times 0.7071$) so moving diagonally does not give a $\sqrt{2} \approx 1.414\times$ speed boost.
- **Window Blur Protection:** Listens to `window.blur` to clear pressed keys when clicking outside the browser, preventing characters from walking forever.

### 🏢 35×25 Office Map & Tiled Integration
- **LimeZu Modern Interiors Tileset:** Sourced and integrated 32×32 pixel art tilesets (`Room_Builder_free_32x32.png`, `Interiors_free_32x32.png`), credited under free non-commercial license in `client/public/assets/CREDITS.md`.
- **Orthogonal Tiled Map (`office.json`):** 35 columns by 25 rows ($1120 \times 800\text{ px}$) across 7 layers:
  1. `Floor`: Base carpet and hardwood tiles.
  2. `Walls`: Structural barriers, perimeter walls, and room dividers.
  3. `decorations_wall_lobby` & `decorations 2_wall_lobby`: Baseboards, trims, and wall accents.
  4. `furniture_layer_1`: Desks, tables, chairs, and large furniture.
  5. `office_elements_1`: Monitors, laptops, plants, and accessories.
  6. `stage`: Presentation stage area.
- **6 Office Zones Blueprint:** Designed with spacious corridors ($\ge 64\text{ px}$) and desk pods spaced beyond `EARSHOT_PX` (100 px):
  - **The Lobby:** Spawn area for newly joined participants.
  - **The Lounge:** Relaxation area for open group conversations.
  - **Phone Booths:** 1-on-1 private rooms for confidential audio.
  - **Open Desks:** Clustered workstation pods for teams.
  - **Meeting Room:** Enclosed conference room for private discussions.
  - **Stage:** Broadcast area for all-hands presentations.
- **Mathematical Affine Transformation Matrix:** Extracts Tiled bitwise flags (`FLIPPED_HORIZONTALLY_FLAG`, `FLIPPED_VERTICALLY_FLAG`, `FLIPPED_DIAGONALLY_FLAG`) and applies affine transformations (`ctx.transform(a, b, c, d, 0, 0)`) so rotated carpets and sofas render exactly as designed in Tiled.

### 🛑 Collision Detection & Sliding
- **Map Collision Engine (`checkCollision`):** Evaluates solid tile IDs on the `Walls` layer and bounds checks map limits.
- **Wall Sliding:** Movement updates evaluate X and Y axes independently. Walking diagonally into a wall slides the avatar smoothly along the surface instead of coming to a dead stop.
- **Doorway Filtering:** Filtered out stray floor tile IDs (#926) that acted as invisible collision barriers in doorways.

### 🌐 Network, Bots & Interpolation
- **Autonomous Wandering Bots (`fakeNet.js`):** Simulates the backend server with 1 to 50 bots (Alex, Sam, Riya, Taylor, etc.) that wander realistically and turn away when hitting walls (`stepBot` with collision checks).
- **Throttled Position Broadcasting:** Sends position updates via `net.sendMove` at most 10 times a second (`MOVE_SEND_HZ = 10`), and only when the character actually moved.
- **Framerate-Independent Exponential Interpolation (Lerp):** Remote characters glide smoothly between 100 ms network packets using exponential decay ($1 - (1 - 0.15)^{\Delta t \cdot 60}$), eliminating position popping.
- **Graceful Bot Cleanup on Disconnect:** Emits `playerLeft` events when `fakeNet.destroy()` is called, immediately removing avatars when reducing bot counts (e.g. 50 to 1) instead of leaving them frozen.
- **React StrictMode Double-Mount Fix:** Instantiates network connections inside `useEffect` with dedicated teardown, preventing development mode from destroying active timers.

### 📷 Viewport, UI & Audio Integration
- **Responsive Whole-Map Viewport:** Automatically shows the entire $1120 \times 800\text{ px}$ office for maps within $1600 \times 1200\text{ px}$ with camera fixed at `(0, 0)`, eliminating unnecessary scrolling. Larger maps automatically switch to a $900 \times 600\text{ px}$ follow camera.
- **CSS Responsiveness:** `maxWidth: '100%'` and `height: 'auto'` proportionally scales down canvas display on small laptop screens while maintaining internal map coordinate integrity.
- **Spatial Audio Ring (`EARSHOT_PX = 100`):** Renders a visual hearing radius centered on the avatar's head (`renderX + 16, renderY + 10`), matching Person 4's audio volume falloff.
- **Player Name Badges:** Renders dynamic rounded pill badges (`ctx.measureText`) behind user and bot names for crisp legibility over detailed carpet patterns.
- **Upstream Callback (`onFrame`):** Delivers absolute world coordinates `{ self, others }` to the audio mixer on every animation frame.

---

## 3. Directory Layout

```
client/src/world/
├── index.js              # Module entry point (exports WorldCanvas, WorldLab, createFakeNet)
├── WorldCanvas.jsx       # 60 FPS Canvas game loop, input handling, physics & rendering
├── WorldLab.jsx          # Standalone test laboratory component with controls
├── fakeNet.js            # Standalone simulated network with collision-aware wandering bots
├── map.js                # Map loader, layer drawer, affine matrix transforms & collision engine
└── README.md             # This documentation

client/public/
├── maps/
│   ├── office.json       # Tiled map JSON export (35×25 tiles, 32×32 px)
│   ├── Room_Builder_free_32x32.png
│   ├── Interiors_free_32x32.png
│   └── Interior.png
└── assets/
    └── CREDITS.md        # Asset attribution and free license records
```

---

## 4. Contract Implementation

This module satisfies all interface specifications in `CONTRACTS.md` (Section 7):

```javascript
// WorldCanvas Props
<WorldCanvas
  net={net}               // Real socket net (Person 1) or createFakeNet
  selfId={selfId}         // Local user ID string
  spawn={spawn}           // { x, y } spawn coordinate
  initialPlayers={players}// Initial array of connected players
  onFrame={onFrame}       // onFrame(frame) callback fired every 60 FPS frame
  debug={true}            // Displays FPS counter & 100 px audio radius
/>

// onFrame payload passed to Person 4's spatial audio mixer:
onFrame({
  self: { id: 'self', x: 200, y: 200 },
  others: [
    { id: 'bot-1', x: 280, y: 200, blocked: false },
    { id: 'bot-2', x: 450, y: 320, blocked: false }
  ]
});
```

---

## 5. How to Run & Test

Open the isolated laboratory page:
```bash
# Start frontend
cd client && npm run dev
```
Navigate to: **`http://localhost:5173/?lab=world`**

In the World Lab:
- Use **WASD** or **Arrow keys** to walk around the office.
- Toggle **Debug Audio Circle** to see the 100 px spatial hearing boundary.
- Toggle bot controls (**1 bot**, **3 bots**, **5 bots**, or **50 bots stress test**) to verify smooth 60 FPS multi-user rendering and wall collisions.


## 6. v5 changes for the Infotact office (added by Person 1)

- **The map is now generated.** `client/public/maps/office-base.json` is your original 35 × 25 office.
  `office.json` is built from it by `node server/scripts/build-office-map.js` (85 × 53 tiles: your office
  in the top-left, plus a corridor, an elevator and four 25-desk wings in the same tileset). To change
  your office: edit `office.tmx` in Tiled, **export to `office-base.json`**, then run the script.
  Exporting straight to `office.json` would remove the wings.
- `map.js`: `renderMapToCanvas(map)` draws the map once to a hidden canvas (60 FPS on the big map);
  `checkCollision` checks every layer called `collision` or `walls` (the new invisible `collision`
  layer blocks the outside area).
- `WorldCanvas.jsx`: new optional props (fill, zoom, camera controller, colours, name tags with status
  dots, the office overlay). Without them it behaves as before, so the World Lab works unchanged; the
  bigger map simply uses the follow camera there.
- `officeOverlay.js` (new): department borders, closed wings, room labels, elevator, desk pulse,
  avatars and name tags.

## 7. v6 changes: a new office layout (added by Person 1) — please read, Anjali

- **The floor is now drawn by code**, not copied from your Tiled map: `server/scripts/office-map/plan.js`
  (the plan), `builder.js` (floors, walls with faces, stamps), `tiles.js` (which tiles we use).
  `node server/scripts/build-office-map.js` writes `office.json` and `server/office/layout.json`.
  It is a 110 × 80 Gather-style office: desk neighbourhoods (pods of 4–8 among plants), meeting rooms of
  three sizes, phone booths, focus rooms, a stage hall, kitchen with tea tables, a lobby with a coffee
  bar, a terrace. Same three LimeZu tilesets, so the same art style.
- **Your original office no longer appears as one block** (it did not fit the new plan), but its pieces
  are kept and recognisable: your white meeting table (same tiles) in every meeting room, your
  reception desk in the lobby, your grey lounge sofas and floor lamp, your salmon wall colour in the
  corridors and your striped wood floor. `office-base.json` and `office.tmx` are unchanged; the
  generator now only takes the embedded tilesets from `office-base.json`.
- To change the layout: edit `plan.js` and run the script, or (stage 5) upload a Tiled JSON on the
  admin page (Layouts). Exporting from Tiled straight into `office.json` would get out of step with
  `layout.json` (desks, areas), so don't.
- New in the world module: `areas.js` (which area am I in), the area highlight (a dark film around the
  room you're in), "coming soon" neighbourhoods (light cover + rope), department outlines that follow
  any desk shape, Shift to run, wall-muffled voices (`soundWalls.js`) and the F key FPS counter.
