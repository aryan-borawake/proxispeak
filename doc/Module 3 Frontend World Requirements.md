# Module 3: Frontend World Requirements

## 1. Purpose

Module 3 is responsible for the visible, interactive 2D office world in
ProxiSpeak. It renders the office map and player avatars, handles local
keyboard movement, displays remote players, and provides player-position data
to the audio system.

The module should use a 2D HTML canvas and a Tiled map exported as JSON. An
AutoCAD model may be used as a design reference, but the runtime map for this
module should remain a 2D Tiled map.

## 2. Pages and components

### 2.1 WorldLab test page

Create:

```text
client/src/world/WorldLab.jsx
```

This is the only dedicated page required for the module. It must be available
at:

```text
http://localhost:5173/?lab=world
```

The page is used to develop and test the world without requiring the real
server. It should render `WorldCanvas` with `fakeNet.js`, which supplies
simulated bot players.

The test page should make it possible to verify:

- Canvas rendering
- Keyboard movement
- Wall and furniture collision
- Camera following
- Remote-player interpolation
- Character animation
- FPS performance
- Five or more fake players, and eventually 50 bots

The test page may show debug information such as FPS, player coordinates,
controls, and the number of active bots. These controls are for development
and do not need to become production UI.

### 2.2 WorldCanvas component

Create:

```text
client/src/world/WorldCanvas.jsx
```

`WorldCanvas` is the reusable world component that the main application can
embed. It is not a separate browser page.

Expected usage:

```jsx
<WorldCanvas
  net={net}
  selfId="u1"
  spawn={{ x: 200, y: 200 }}
  initialPlayers={initialPlayers}
  onFrame={onFrame}
  debug={true}
/>
```

Responsibilities:

- Create and size the canvas
- Start and stop the animation loop
- Read keyboard input
- Move the local player
- Check collision before applying movement
- Draw the map, local player, and remote players
- Draw names and debug indicators
- Send local movement through `net.sendMove`
- Subscribe to remote-player updates
- Call `onFrame` once per animation frame

Frequently changing positions must be kept in refs or another per-frame data
structure rather than React state. React should not re-render the component 60
times per second.

## 3. Supporting files

Create these files under `client/src/world/`:

| File | Responsibility |
| --- | --- |
| `WorldCanvas.jsx` | Main reusable canvas component |
| `WorldLab.jsx` | Standalone development and testing page |
| `gameLoop.js` | `requestAnimationFrame`, delta time, and frame callbacks |
| `input.js` | Arrow-key and WASD tracking, including blur handling |
| `map.js` | Load and draw the Tiled map and its tilesets |
| `collision.js` | Check blocked tiles and support sliding along obstacles |
| `avatars.js` | Draw avatars, names, interpolation, direction, and animation |
| `fakeNet.js` | Simulate the network and wandering bot players |

The module should not take ownership of `App.jsx`, the `shared/` directory, or
the audio mixer implementation.

## 4. Map and assets

Create or provide:

```text
client/public/maps/office.json
client/public/assets/
client/public/assets/CREDITS.md
```

The office map should be designed in Tiled and exported as an orthogonal map
with 32 x 32 tiles and embedded tileset information.

Expected map layers:

- `floor`: walkable floor tiles
- `furniture`: desks and other visible objects
- `collision`: non-zero tiles that block movement
- `zones`: zone objects used later for meeting rooms, stages, and other areas
- `spawn`: starting points for players

Use only assets with an appropriate free license. Record the source and license
for each external asset in `client/public/assets/CREDITS.md`. Pixel-art images
should be rendered with image smoothing disabled.

## 5. Network contract

`WorldCanvas` must work with either the real network connection or
`fakeNet.js`. The network object is expected to provide:

```js
net.sendMove({ x, y, dir })
net.onPlayersState(callback)
net.onPlayerJoined(callback)
net.onPlayerLeft(callback)
```

Each subscription should return an unsubscribe function, and
`WorldCanvas` should call those functions during cleanup.

Movement updates must:

- Be sent no more than 10 times per second
- Be sent only when the local player has actually moved
- Include the current direction as `up`, `down`, `left`, or `right`

## 6. Required behavior

### Local movement

- Support arrow keys and W/A/S/D.
- Use delta time so movement speed is consistent across machines.
- Clear all pressed keys on window `blur` to prevent stuck movement.

### Collision

- Check the next position against the collision layer before moving.
- Prevent movement through walls and furniture.
- Allow sliding along an obstacle during diagonal movement.

### Remote players

- Draw remote players received from the network.
- Store enough recent position data to interpolate their movement.
- Render remote players approximately 100 ms behind real time so they glide
  instead of jumping between network updates.

### Camera

- Keep the local player near the center when the map is larger than the
  viewport.
- Clamp the camera to the map boundaries.
- Move the camera smoothly.

### Avatars

- Use free character sprites instead of permanent placeholder circles.
- Face the direction of movement.
- Show a walking animation while moving.
- Provide an idle appearance when stationary.
- Draw each player's name above their avatar.

### Debug and audio data

When debug mode is enabled:

- Show an FPS counter.
- Draw a 100-pixel hearing-radius circle around the local player.
- Make it clear which players are inside the local hearing radius.

Call `onFrame` every animation frame with:

```js
{
  self: { id, x, y },
  others: [
    { id, x, y, blocked }
  ]
}
```

The `blocked` property may remain `false` until line-of-sight support is added
in the later zones-and-walls phase.

## 7. Delivery schedule

| Day | Deliverable |
| --- | --- |
| 1 | Canvas and colored test rectangle |
| 2 | Animation loop and FPS counter |
| 3 | Keyboard movement with delta time |
| 4 | Tiled office map and map rendering |
| 5 | Fake network, five bots, and throttled position sending |
| 6 | Wall and furniture collision |
| 7 | Smooth remote-player interpolation |
| 8 | Camera following |
| 9 | Animated character sprites |
| 10 | Names, hearing circle, and `onFrame` data |
| 11 | Performance test with 50 bots |
| 12 | Blur handling and movement-freeze period |
| 13 | Module documentation |
| 14 | Team rehearsal and viva notes |

Use module-scoped commit messages, for example:

```text
feat(world): keyboard movement
fix(world): stuck keys on window blur
```

Integration pull requests should be opened into the team's `dev` branch on the
scheduled integration days.

## 8. Acceptance criteria

The module is ready for integration when:

1. `/?lab=world` displays the world independently of the real server.
2. The office map loads from `client/public/maps/office.json`.
3. The local player moves with arrow keys and W/A/S/D.
4. Walls and furniture block movement without preventing wall sliding.
5. Other players and bots glide smoothly rather than jumping.
6. The camera follows the local player on a large map.
7. Avatars, names, directions, and walking animations render correctly.
8. Local movement is sent at most 10 times per second and only after movement.
9. `onFrame` supplies current positions to the audio mixer.
10. The FPS remains close to 60 with 50 bots.
11. Pressed keys are cleared when the browser window loses focus.
12. All visual assets have their source and license recorded.

## 9. Later enhancements

During the later zones and polish phases:

- Add and render zone types such as meeting rooms, focus rooms, stages, lobbies,
  and phone booths.
- Implement line-of-sight checks against walls.
- Include wall-blocking information in `onFrame`.
- Render the static map through an offscreen canvas.
- Highlight the player on the stage.
- Improve camera smoothing and idle animation.
- Deploy the frontend as a Render static site.
