# Module 3 — 2D World (Canvas)

**For: Person 3.** Owner: ________

> **How to read this brief.** Sections 1–5 explain your module. Section 6 is your plan: read each task on the day the calendar gives it, not all at once. The appendix at the end is written for your AI tool, so you can skip it.

---

## 1. What this module does

Your module is what everyone actually **sees**: the office map and the little characters walking around it, like an old Pokémon game.

**Example.** You press the right arrow key.

1. Your code notices the key is held down.
2. It moves your character a few pixels to the right, unless a wall or desk is in the way.
3. It redraws the whole picture: floor, furniture, every character, their names.
4. It does this again and again, **60 times every second**, so the movement looks smooth.

Meanwhile:

- **10 times a second**, your code sends your position to the server: "I'm at x = 340, y = 210."
- **10 times a second**, other people's positions arrive. Your code slides their characters smoothly towards the new spot, so they glide instead of jumping.

---

## 2. Where your module fits

1. You send your position through **Person 1's** connection (`net`) to the server.
2. You receive everyone else's positions through the same connection and draw them.
3. Every frame, you hand everyone's positions to **Person 4's** sound mixer (through `App.jsx`, which Person 1 owns), so voices get louder as people come closer.
4. In Week 3, you give **Person 2** the office map file with the zones (meeting room, stage and so on) marked on it.

---

## 3. Your folders

| Folder or file | What goes in it |
|---|---|
| `client/src/world/WorldCanvas.jsx` | The React piece that holds the drawing area |
| `client/src/world/gameLoop.js` | The code that redraws 60 times a second |
| `client/src/world/input.js` | Which keys are pressed |
| `client/src/world/map.js` | Loads and draws the office map |
| `client/src/world/collision.js` | Stops you walking through walls |
| `client/src/world/avatars.js` | Draws the characters and slides them smoothly |
| `client/src/world/fakeNet.js` | A pretend server with wandering bots, for testing alone |
| `client/src/world/WorldLab.jsx` | Your test page (open `localhost:5173/?lab=world`) |
| `client/public/maps/` | The office map file (`office.json`) and its tile images |
| `client/public/assets/` | Character images, plus `CREDITS.md` saying where each came from |

**Not yours:** everything else, including `App.jsx` (Person 1) and `shared/`.

---

## 4. Words you need

| Word | Plain meaning |
|---|---|
| React | The library we use to build the web page out of reusable pieces |
| Component | One reusable piece of a React page, e.g. `<WorldCanvas />` |
| Props | The settings you pass into a component, like function arguments |
| Canvas | A blank drawing area in the web page that code can paint on |
| Context (`ctx`) | The object with the drawing functions, e.g. `ctx.fillRect()` draws a rectangle, `ctx.drawImage()` draws a picture |
| Frame | One full redraw of the canvas |
| FPS | Frames per second. We aim for 60. Below about 30, movement looks choppy |
| Game loop | Code that redraws the screen again and again |
| `requestAnimationFrame` | A browser function meaning "run my drawing code right before the screen refreshes". It's how the game loop repeats |
| Delta time | How much time passed since the last frame. Moving `speed × delta time` keeps walking speed the same on slow and fast computers |
| State (React) | Data that makes React redraw the page when it changes |
| Re-render | React redrawing a component. Doing this 60 times a second makes the page slow |
| Ref (`useRef`) | A box that holds a value without making React redraw. Perfect for positions that change every frame |
| `keydown` / `keyup` | Browser events fired when a key is pressed / released |
| WASD | The W, A, S, D keys, used like arrow keys in games |
| Tiled | A free desktop app for designing tile-based maps. It saves the map as a JSON file |
| Tile | One small square picture (e.g. 32 × 32 pixels of floor or desk) |
| Tileset | One image containing all the tiles |
| Tilemap | The grid that says which tile goes where |
| Layer | One sheet of the map stacked on others: floor, furniture, collision, zones |
| Embed (tileset) | A Tiled option that saves the tileset details inside the map file, so one file has everything |
| JSON | A text format for data that looks like a JavaScript object |
| Kenney / CC0 | Kenney.nl gives away game art; CC0 means anyone may use it for free, even without credit (we credit anyway) |
| Collision layer | The map layer marking tiles you can't walk through |
| Interpolation | Sliding a character smoothly between two known positions |
| Camera | The part of the map shown on screen. It follows you when the map is bigger than the screen |
| Sprite | A small picture of a character |
| Sprite sheet | One image containing all the frames of a character's walking animation |
| Callback | A function you're given so you can call it later. `onFrame` is one: you call it every frame |
| Bot | A fake character controlled by code |
| Throttle | Limit how often something happens, e.g. send position at most 10 times a second |
| Chrome Performance tab | A tool in Chrome's developer tools that records how long each frame takes |
| Focus / blur | A window has focus when it's active; blur is when you click away from it |
| Zone | A marked area of the map, like a meeting room |
| Line of sight | Whether a straight line between two characters crosses a wall |
| Offscreen canvas | A hidden canvas you draw once and copy from, so you don't redraw every tile every frame |
| Image smoothing | The browser blurring pictures when it scales them. Bad for pixel art, so we turn it off |
| `onload` | An event that fires when an image has finished loading |
| Deploy / Render static site | Put the app online; Render is the free hosting we use for the web page |

---

## 5. Working alone

You never have to wait for the server:

- **`fakeNet.js`** has the same functions as Person 1's real connection, but its "other players" are bots that wander around the office. Give it to your component and everything works with no server running.
- **Your test page** (`?lab=world`) shows your world on its own.

---

## 6. Your two weeks

**Commit messages.** The word before the colon says what kind of change it is: `feat` = new feature, `fix` = bug fix, `docs` = documentation, `perf` = speed improvement. The word in brackets is your module. Example: `feat(world): keyboard movement`.

**Integration days** (Wed 21 and Sat 24 Oct): open a pull request from your branch into `dev` in the morning. Sat 17 Oct is a setup check: your branch exists and your work runs on your laptop.

### Calendar

Tasks are numbered. This calendar says which day to do each one. If the plan slips again, only this table changes.

| Date | Do these tasks | Notes |
|---|---|---|
| Fri 16 Oct | 1, 2 | Create your branch from `main`; start your log |
| Sat 17 Oct | 3 | Setup check |
| Sun 18 Oct | 4 |  |
| Mon 19 Oct | 5 |  |
| Tue 20 Oct | 6 |  |
| Wed 21 Oct | 7 | **Integration #1:** pull request into `dev` in the morning |
| Thu 22 Oct | 9 |  |
| Fri 23 Oct | 10 | Tell Person 4 that `onFrame` is ready |
| Sat 24 Oct | 11, 12 | **Integration #2 + mid freeze:** pull request in the morning |
| Sun 25 Oct | 13 |  |
| Mon 26 Oct | 14 |  |
| Week 3 | 8 | Camera (optional) |

### Task by task

**Task 1: a canvas on the page.**
- Build: `WorldCanvas.jsx` puts a canvas on your test page and draws one coloured rectangle. Create your log. Person 1's prototype is a good reference, but write your own code so you can explain it.
- Why: the first step of any drawing app.
- Done when: `npm run dev` shows the rectangle at `?lab=world`.
- Commit: `feat(world): canvas component`

**Task 2: the game loop.**
- Build: a loop using `requestAnimationFrame` that clears and redraws the canvas every frame. Show an FPS counter in the corner. Keep the numbers in a ref, not in React state.
- Why: smooth movement needs a redraw 60 times a second.
- Done when: the counter shows about 60.
- Commit: `feat(world): game loop with FPS counter`

**Task 3: walk with the keyboard.**
- Build: track which keys are held (arrows and WASD). Move a circle (your character, for now) using delta time.
- Why: this is the spec's Week 1 frontend task, "smooth keyboard avatar movement".
- Done when: the circle walks smoothly in all four directions.
- Commit: `feat(world): keyboard movement`

**Task 4: the office map.**
- Build: install Tiled. Make a small office with a free Kenney tileset (floor, walls, desks), with the tileset embedded. Export `office.json`. Load it and draw the floor and furniture layers. Write the asset source and license in `CREDITS.md`.
- Why: our map is data, so changing the office later needs no code changes.
- Done when: your office appears on the canvas.
- Commit: `feat(world): load and draw Tiled office map`

**Task 5: bots, and sending your position.**
- Build: `fakeNet.js` with 5 bots that wander around; draw them. Send your own position through `net.sendMove` at most 10 times a second, and only when you actually moved.
- Why: the spec asks for "coordinate broadcasting", and bots let you test without the server.
- Done when: 5 bots walk around while you walk too.
- Commit: `feat(world): fake network and position sending`

**Task 6: walls stop you.**
- Build: before each step, check the collision layer. If the next tile is a wall or desk, don't move into it, but still slide along the wall if you press diagonally.
- Done when: you can't walk through any wall or desk.
- Commit: `feat(world): wall collision`

**Task 7: other characters glide.**
- Build: keep the last two positions received for each other player, and draw them partway between, about 100 ms behind real time.
- Why: positions arrive only 10 times a second, so without this, others jump in steps.
- Done when: bots glide instead of jumping.
- Commit: `feat(world): smooth movement for other players`

**Task 8: camera (optional; moved to Week 3).**
- Build: when the map is bigger than the screen, keep your character in the middle and scroll the map around it.
- Done when: walking to the edge of a big map scrolls smoothly.
- Commit: `feat(world): camera follow`

**Task 9: real characters.**
- Build: replace the circles with character pictures from a Kenney sprite sheet. Face the direction of walking, and play a walking animation.
- Commit: `feat(world): animated avatar sprites`

**Task 10: names, earshot circle, positions for the mixer.**
- Build: draw each name above its character. Add a debug circle of 100 px around you, showing who you can hear. Add the `onFrame` callback, which gives everyone's positions every frame. Tell Person 4 it's ready.
- Why: Person 4's mixer needs positions every frame to set volumes.
- Commit: `feat(world): names, earshot circle, onFrame`

**Task 11: speed check.**
- Build: run with 50 bots. The FPS must stay near 60. Record a few seconds in Chrome's Performance tab and put a screenshot in your log.
- Why: the spec requires a steady 60 FPS with 50+ users.
- Commit: `perf(world): 50-bot FPS check`

**Task 12: fix stuck keys (mid freeze).**
- Build: when you click away from the window, the browser never sends `keyup`, so your character keeps walking forever. Clear all pressed keys on blur. From now until the review, only fixes.
- Commit: `fix(world): stuck keys on window blur`

**Task 13: explain it.**
- Build: `docs/world.md`: how your module works, in your own words.
- Commit: `docs: world module explanation`

**Task 14: rehearsal.**
- Build: run the demo with the team. Write viva notes in your log.
- Commit: `docs: viva notes`

---

## 7. Mid review: what you show

Several characters (two real browser tabs plus bots) walking smoothly around the office, walls blocking them, and the FPS counter showing 60.

---

## 8. Weeks 3–4

**Week 3: zones and walls**
- In Tiled, add a `zones` layer: meeting room, focus room, stage, lobby, phone booth, each marked with its type. Give the updated map to Person 2.
- Draw each zone as a lightly coloured area with a label.
- `lineOfSight.js`: check whether the straight line between two characters crosses a wall. Pass the answer to Person 4 through `onFrame`, so voices behind walls sound quieter.

**Week 4: polish and go live**
- Draw the map once into an offscreen canvas and copy it each frame, instead of drawing every tile 60 times a second.
- Check 60 FPS with 50 bots again; highlight whoever is on the stage; smooth the camera; add an idle animation.
- Put the web page online as a Render static site.

---

## 9. Final review: what you show

A polished office at a steady 60 FPS with 50 bots: zones visible, walls blocking movement and sound, characters gliding smoothly.

---

## 10. Viva questions, with short answers to build on

| Question | Short answer |
|---|---|
| Why `requestAnimationFrame` and not `setInterval`? | It runs exactly in time with the screen refresh, and pauses when the tab is hidden |
| Why draw 60 times a second but send only 10 positions? | Drawing must look smooth; the server and network don't need every tiny step |
| What is interpolation? | Sliding other characters between known positions so they don't jump |
| What is delta time? | Time since the last frame; using it keeps speed the same on fast and slow computers |
| Why not keep positions in React state? | Every change would redraw the page 60 times a second and kill the frame rate |
| How does wall collision work? | Before moving, check whether the next tile on the collision layer is blocked |

---

## 11. Mistakes to avoid

- Don't keep positions in React state. Use refs.
- Pixel art looks blurry unless you set `ctx.imageSmoothingEnabled = false`.
- Clear pressed keys on blur, or characters walk forever.
- Wait for images to load before drawing them.
- Use only free-licensed art (Kenney). Never Gather's.
- Throttle position sending in one place, and send only when you actually moved.

---

## Appendix: for your AI tool

The exact names live in `CONTRACTS.md`. This is a summary.

```jsx
// client/src/world/index.js
<WorldCanvas
  net={net}                          // real client/src/net, or createFakeNet()
  selfId="u1"
  spawn={{ x: 200, y: 200 }}
  initialPlayers={[{ id, name, x, y, dir }]}
  onFrame={(frame) => {}}            // every animation frame
  debug={true}                       // FPS counter, earshot circle
/>
// frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }   // blocked false until Week 3

createFakeNet({ bots })              // same functions as net, with wandering bots
WorldLab                             // test page component (?lab=world)

// Uses from net: sendMove({ x, y, dir }) (≤ MOVE_SEND_HZ, only when moved),
// onPlayersState(cb), onPlayerJoined(cb), onPlayerLeft(cb) — each returns an unsubscribe function.
// dir is 'up' | 'down' | 'left' | 'right'.

// Map: client/public/maps/office.json, orthogonal, 32×32 tiles, embedded tilesets.
// Layers: floor, furniture, collision (non-zero = blocked), zones (objects with zoneType, name), spawn (point).
```
