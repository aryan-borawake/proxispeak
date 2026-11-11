// client/src/world/WorldCanvas.jsx — Person 3
import React, { useEffect, useRef, useState } from 'react';
import { loadOfficeMap, drawMap, checkCollision } from './map';
import { MOVE_SEND_HZ, EARSHOT_PX } from '@shared/constants.js';

// Walking speed in pixels per SECOND (not per frame).
// Each frame we move speed × deltaTime, so a 60 Hz and a 144 Hz screen walk at the same speed.
// Example: at 60 FPS one frame is about 0.0167 s, so one step is 180 × 0.0167 ≈ 3 px.
const WALK_SPEED_PX_PER_SEC = 180;

// The longest frame gap we accept, in seconds. If the window was in the background for
// 2 seconds, the next frame's deltaTime would be 2 s and we'd jump 360 px in one step
// (maybe through a wall). So we never use more than 0.05 s (one step of at most 9 px).
const MAX_DELTA_SEC = 0.05;

// Maps up to this many pixels wide and tall are shown WHOLE, with no scrolling camera.
// Our office is 35 × 25 tiles of 32 px = 1120 × 800 px, so it fits.
const WHOLE_MAP_MAX_WIDTH_PX = 1600;
const WHOLE_MAP_MAX_HEIGHT_PX = 1200;

// Canvas size for big maps (and while the map is still loading); the camera follows you.
const FOLLOW_CANVAS_WIDTH_PX = 900;
const FOLLOW_CANVAS_HEIGHT_PX = 600;

/**
 * Should we show the whole map at once (canvas = map size, camera fixed at 0, 0)?
 * true for maps up to 1600 × 1200 px; false for bigger maps or before the map has loaded.
 */
function canShowWholeMap(map) {
  if (!map) return false;
  const mapWidthPx = map.width * map.tileSize;
  const mapHeightPx = map.height * map.tileSize;
  return mapWidthPx <= WHOLE_MAP_MAX_WIDTH_PX && mapHeightPx <= WHOLE_MAP_MAX_HEIGHT_PX;
}

/**
 * Put the players we were given at the start (initialPlayers) into the `others` Map,
 * skipping myself. Used on first load and again whenever the `net` changes.
 */
function addInitialPlayers(others, initialPlayers, selfId) {
  if (!Array.isArray(initialPlayers)) return;
  initialPlayers.forEach((p) => {
    if (p.id !== selfId) {
      others.set(p.id, {
        id: p.id,
        name: p.name || `Player ${p.id}`,
        x: p.x || 200,
        y: p.y || 200,
        targetX: p.x || 200,
        targetY: p.y || 200,
        dir: p.dir || 'down',
      });
    }
  });
}

// How much of the remaining gap other players close in ONE frame at 60 FPS (15%).
const GLIDE_PER_60FPS_FRAME = 0.15;

export function WorldCanvas({ net, selfId = 'self', spawn, initialPlayers = [], onFrame, debug }) {
  const canvasRef = useRef(null);
  const [map, setMap] = useState(null);

  // Player state managed via refs to avoid 60fps React state re-render bottlenecks
  const playerRef = useRef({
    x: spawn?.x || 150,
    y: spawn?.y || 150,
    speed: WALK_SPEED_PX_PER_SEC, // pixels per second
    dir: 'down',
  });

  // Track other players (bots or remote peers)
  const othersRef = useRef(new Map());

  // Throttled position sending tracking
  const lastSentRef = useRef({ time: 0, x: 0, y: 0, dir: 'down' });

  const keysRef = useRef({});

  // The latest initialPlayers, kept in a ref so the network effect below can read it
  // without restarting every time the parent passes a new (but equal) array.
  const initialPlayersRef = useRef(initialPlayers);
  initialPlayersRef.current = initialPlayers;

  // Populate initial players if provided
  useEffect(() => {
    addInitialPlayers(othersRef.current, initialPlayers, selfId);
  }, [initialPlayers, selfId]);

  // Load map metadata on mount
  useEffect(() => {
    loadOfficeMap().then((loadedMap) => {
      setMap(loadedMap);
    });
  }, []);

  // Listen to network events (real server or fakeNet)
  useEffect(() => {
    // A new `net` means a new set of players. Forget everyone from the old net first, or
    // they would stay on screen frozen forever (nobody would ever move them or remove them).
    // Example: WorldLab switches from 50 bots to 1 → the old 50 are cleared, then only
    // the new net's bot appears. The initial players (from world:init) are added back.
    othersRef.current.clear();
    addInitialPlayers(othersRef.current, initialPlayersRef.current, selfId);

    if (!net) return;

    // Handle players state broadcast (10x a second)
    const unsubState = net.onPlayersState?.((state) => {
      if (!state || !Array.isArray(state.players)) return;

      state.players.forEach((p) => {
        if (p.id === selfId) return; // Don't overwrite local player

        const existing = othersRef.current.get(p.id);
        if (existing) {
          existing.targetX = p.x;
          existing.targetY = p.y;
          existing.dir = p.dir || existing.dir;
          if (p.name) existing.name = p.name;
        } else {
          othersRef.current.set(p.id, {
            id: p.id,
            name: p.name || `Player ${p.id}`,
            x: p.x,
            y: p.y,
            targetX: p.x,
            targetY: p.y,
            dir: p.dir || 'down',
          });
        }
      });
    });

    // Handle single player join
    const unsubJoined = net.onPlayerJoined?.((p) => {
      if (p.id !== selfId) {
        othersRef.current.set(p.id, {
          id: p.id,
          name: p.name || `Player ${p.id}`,
          x: p.x,
          y: p.y,
          targetX: p.x,
          targetY: p.y,
          dir: p.dir || 'down',
        });
      }
    });

    // Handle player leave
    const unsubLeft = net.onPlayerLeft?.(({ id }) => {
      othersRef.current.delete(id);
    });

    return () => {
      unsubState?.();
      unsubJoined?.();
      unsubLeft?.();
    };
  }, [net, selfId]);

  // Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e) => { keysRef.current[e.key.toLowerCase()] = true; };
    const handleKeyUp = (e) => { keysRef.current[e.key.toLowerCase()] = false; };
    const handleBlur = () => { keysRef.current = {}; }; // Fix stuck keys on window blur

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Main 60 FPS Game Loop
  useEffect(() => {
    let animationFrameId;
    const sendIntervalMs = 1000 / MOVE_SEND_HZ; // 100 ms

    // Two separate clocks, because they answer two different questions:
    // - lastFrameTime: when did the PREVIOUS frame run? (for deltaTime, used to move)
    // - lastFpsUpdateTime: when did we last update the FPS number? (once a second)
    // The old code used one variable for both and overwrote it every frame, so
    // "a second has passed" was never true and the counter stayed at 60 forever.
    let lastFrameTime = performance.now();
    let lastFpsUpdateTime = lastFrameTime;
    let frameCount = 0; // frames drawn since lastFpsUpdateTime
    let fps = null; // null = not measured yet (shown as "…" for the first second)

    // Big maps use the follow camera; small maps are shown whole (worked out once per map).
    const showWholeMap = canShowWholeMap(map);

    const render = (currentTime) => {
      // deltaSec = seconds since the last frame (about 0.0167 at 60 FPS).
      // Never below 0, and never above MAX_DELTA_SEC, so a background window can't cause a jump.
      const rawDeltaSec = (currentTime - lastFrameTime) / 1000;
      const deltaSec = Math.min(Math.max(rawDeltaSec, 0), MAX_DELTA_SEC);
      lastFrameTime = currentTime;

      // FPS: count frames, and once at least one real second has passed, turn the count
      // into "frames per second". Example: 58 frames in 1004 ms → 58 × 1000 / 1004 ≈ 58 FPS.
      frameCount++;
      const msSinceFpsUpdate = currentTime - lastFpsUpdateTime;
      if (msSinceFpsUpdate >= 1000) {
        fps = Math.round((frameCount * 1000) / msSinceFpsUpdate);
        frameCount = 0;
        lastFpsUpdateTime = currentTime;
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // Keep pixel art sharp

        // 1. Handle Keyboard Movement & Collisions
        let dx = 0;
        let dy = 0;
        const keys = keysRef.current;

        if (keys['arrowup'] || keys['w']) { dy -= 1; playerRef.current.dir = 'up'; }
        if (keys['arrowdown'] || keys['s']) { dy += 1; playerRef.current.dir = 'down'; }
        if (keys['arrowleft'] || keys['a']) { dx -= 1; playerRef.current.dir = 'left'; }
        if (keys['arrowright'] || keys['d']) { dx += 1; playerRef.current.dir = 'right'; }

        if (dx !== 0 && dy !== 0) {
          dx *= 0.7071; // Normalize diagonal speed
          dy *= 0.7071;
        }

        // How far to walk this frame: speed (px per second) × seconds since the last frame.
        // Example: 180 px/s × 0.0167 s ≈ 3 px at 60 FPS, or ≈ 1.25 px at 144 FPS (same speed).
        const stepPx = playerRef.current.speed * deltaSec;
        const nextX = playerRef.current.x + dx * stepPx;
        const nextY = playerRef.current.y + dy * stepPx;

        // Apply map collision checks (allowing sliding along walls)
        // x and y are checked separately: walking diagonally into a wall still moves you along it.
        if (!checkCollision(nextX, playerRef.current.y, map)) {
          playerRef.current.x = nextX;
        }
        if (!checkCollision(playerRef.current.x, nextY, map)) {
          playerRef.current.y = nextY;
        }

        // 2. Throttled Position Sending (MOVE_SEND_HZ = 10/sec, only when moved)
        if (net && typeof net.sendMove === 'function') {
          const hasMoved =
            playerRef.current.x !== lastSentRef.current.x ||
            playerRef.current.y !== lastSentRef.current.y ||
            playerRef.current.dir !== lastSentRef.current.dir;

          if (hasMoved && currentTime - lastSentRef.current.time >= sendIntervalMs) {
            net.sendMove({
              x: playerRef.current.x,
              y: playerRef.current.y,
              dir: playerRef.current.dir,
            });
            lastSentRef.current = {
              time: currentTime,
              x: playerRef.current.x,
              y: playerRef.current.y,
              dir: playerRef.current.dir,
            };
          }
        }

        // 3. Smooth Interpolation for Other Players / Bots
        othersRef.current.forEach((other) => {
          // Slide smoothly towards target position (approx 100ms interpolation)
          // Time-based glide: at 60 FPS each frame closes 15% of the gap, like before.
          // A fixed 0.15 per frame would glide 2.4× faster on a 144 Hz screen, so instead we
          // ask "what is left of the gap after this much time?": 0.85 per 1/60 s, so
          // 0.85 ^ (deltaSec × 60). Example: 60 FPS → 1 - 0.85^1 = 0.15;
          // 144 FPS → 1 - 0.85^0.417 ≈ 0.066 per frame, which adds up to the same speed.
          const glide = 1 - Math.pow(1 - GLIDE_PER_60FPS_FRAME, deltaSec * 60);
          other.x += (other.targetX - other.x) * glide;
          other.y += (other.targetY - other.y) * glide;
        });

        // 4. Camera: which part of the map is on screen.
        // Small map (like our office): the canvas is as big as the map, so the camera stays at
        // (0, 0) and everything is visible. Big map: the camera follows you, keeping you centred.
        const camera = showWholeMap
          ? { x: 0, y: 0 }
          : {
              x: playerRef.current.x - canvas.width / 2,
              y: playerRef.current.y - canvas.height / 2,
            };

        // 5. Clear & Render Map Layout
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawMap(ctx, map, camera);

        // 6. Draw Other Players / Bots
        othersRef.current.forEach((other) => {
          const ox = other.x - camera.x;
          const oy = other.y - camera.y;

          // Remote Avatar (Blue/Indigo circle)
          ctx.fillStyle = '#6366f1';
          ctx.beginPath();
          ctx.arc(ox + 16, oy + 10, 16, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(ox + 8, oy + 16, 16, 18);

          // Name Tag above head
          ctx.fillStyle = '#c7d2fe';
          ctx.font = '11px sans-serif';
          ctx.fillText(`● ${other.name}`, ox - 4, oy - 4);
        });

        // 7. Draw Local Player Avatar ("You")
        const renderX = playerRef.current.x - camera.x;
        const renderY = playerRef.current.y - camera.y;

        ctx.fillStyle = '#22c55e'; // Green indicator for local user
        ctx.beginPath();
        ctx.arc(renderX + 16, renderY + 10, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(renderX + 8, renderY + 16, 16, 20);

        // Name Tag & Status ("You")
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px sans-serif';
        ctx.fillText('● You', renderX - 4, renderY - 4);

        // 8. Debug Overlay (FPS Counter & Earshot Range Circle)
        if (debug) {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          // Same centre as the green avatar circle above (renderX + 16, renderY + 10),
          // so the ring is really "100 px around me". (It used to be 10 px too low.)
          ctx.arc(renderX + 16, renderY + 10, EARSHOT_PX, 0, Math.PI * 2); // 100px boundary
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px monospace';
          ctx.fillText(`FPS: ${fps === null ? '…' : fps}`, 15, 25);
          ctx.fillText(`Active Peers: ${othersRef.current.size}`, 15, 42);
        }

        // 9. Report positions upstream to audio mixer via callback
        if (typeof onFrame === 'function') {
          onFrame({
            self: { id: selfId, x: playerRef.current.x, y: playerRef.current.y },
            others: Array.from(othersRef.current.values()).map((o) => ({
              id: o.id,
              x: o.x,
              y: o.y,
              blocked: false,
            })),
          });
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [map, debug, selfId, onFrame, net]);

  // Canvas size: the map's own size when it fits (whole office on screen),
  // otherwise the smaller follow-camera window.
  const showWholeMap = canShowWholeMap(map);
  const canvasWidth = showWholeMap ? map.width * map.tileSize : FOLLOW_CANVAS_WIDTH_PX;
  const canvasHeight = showWholeMap ? map.height * map.tileSize : FOLLOW_CANVAS_HEIGHT_PX;

  // width/height (attributes) = how many pixels we draw. The CSS below only changes how big
  // it LOOKS: maxWidth 100% + height auto shrinks it evenly in a narrow window, while all
  // drawing code still uses map pixels.
  return (
    <div>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          display: 'block',
          margin: '0 auto',
          maxWidth: '100%',
          height: 'auto',
          background: '#090d16',
        }}
      />
    </div>
  );
}
