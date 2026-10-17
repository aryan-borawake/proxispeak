# Proximity Office – throwaway prototype

A tiny Gather-style virtual office that makes proximity-audio terms visible.
No backend, no images: everything is drawn on an HTML5 canvas.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## What to try
- Walk (WASD / arrows) towards a bot: once it enters the dashed **earshot** circle,
  the panel shows its distance, volume % and left/right pan.
- Turn **Throttling** off: "Position sends/sec" jumps from 10 to your FPS (~60).
- Turn **Interpolation** off: bots hop 10 times per second instead of gliding.

## Files
| File | What's inside |
|---|---|
| `src/map.js` | The 25×18 tile map as a JSON array |
| `src/world.js` | Movement, wall collision, wandering bots (10 updates/sec) |
| `src/proximity.js` | Earshot, volume and pan maths |
| `src/network.js` | Fake `sendPosition()` + throttling |
| `src/draw.js` | Canvas drawing |
| `src/Game.jsx` | The `requestAnimationFrame` game loop + interpolation |
| `src/DebugPanel.jsx` | Live debug sidebar |
