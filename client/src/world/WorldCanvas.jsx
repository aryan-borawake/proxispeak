// client/src/world/WorldCanvas.jsx — Person 3
// The 2D world: the map, my avatar (arrow keys / WASD), everyone else, 60 frames a second.
//
// v5 (Infotact office, added by Person 1; every new prop is optional, so WorldLab works as before):
//   fill          the canvas fills its parent box (full-screen office) instead of a fixed size
//   zoomable      mouse-wheel zoom; zoom is clamped to MIN_ZOOM … MAX_ZOOM
//   controllerRef  WorldCanvas puts { zoomIn, zoomOut, getZoom, locate, jumpTo, pulseAt } in it, so
//                 the page's buttons (+, −, locate me, My desk) can steer the world
//   avatarColor, selfName, selfDotColorRef   how I look; peopleRef: id → { name, color, dotColor }
//   overlayData   { layout, office }: department borders, closed wings (drawn dark AND not walkable),
//                 room labels, the elevator
//   onZoomChange(zoom), onNearElevator(bool)   told when these change (rarely, not every frame)
//   background    the colour behind the map
// v6: mapData  a Tiled map object to draw instead of /maps/office.json (the floor's stored layout)
// v6: showFps  draw the FPS counter (the office toggles it with the F key)
// v6: onAreaChange(area | null)  told when I step into or out of an area (meeting room, pod, …);
//     inside a room (private / silent / stage) the rest of the map is dimmed with a dark film.
// The camera now always follows me smoothly (maps bigger than the screen), and the map is drawn once
// to a hidden canvas (renderMapToCanvas) so each frame is one picture copy: fast at any zoom.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadOfficeMap, renderMapToCanvas, checkCollision } from './map';
import { AVATAR_MIDDLE, DISCONNECT_PX, EARSHOT_PX, MOVE_SEND_HZ, RUN_SPEED_PX_PER_SEC, WALK_SPEED_PX_PER_SEC } from '@shared/constants.js';
import { areaAt, isClosedArea } from './areas.js';
import { buildWallGrid, isWallBetween } from './soundWalls.js';
import {
  buildOverlay,
  drawAreaFocus,
  drawAvatar,
  drawClosedWings,
  drawDepartmentBlocks,
  drawElevator,
  drawNameTag,
  drawOverlayLabels,
  drawPulse,
  drawRunLines,
  isBlockedByOverlay,
} from './officeOverlay.js';

// Walking speed in pixels per SECOND (not per frame): WALK_SPEED_PX_PER_SEC (220), and twice that,
// RUN_SPEED_PX_PER_SEC (440), while Shift is held (v6, both in shared/constants.js: the server's speed
// check uses the same top speed). Each frame we move speed × deltaTime, so a 60 Hz and a 144 Hz screen
// walk at the same speed. Example: at 60 FPS one frame is about 0.0167 s → 220 × 0.0167 ≈ 3.7 px.

// The longest frame gap we accept, in seconds. If the window was in the background for
// 2 seconds, the next frame's deltaTime would be 2 s and we'd jump 360 px in one step
// (maybe through a wall). So we never use more than 0.05 s (one step of at most 9 px).
const MAX_DELTA_SEC = 0.05;

// Maps up to this many pixels wide and tall are shown WHOLE, with no scrolling camera
// (only when the canvas does not fill its parent). The original office (1120 × 800 px) fit;
// the HQ floor (2720 × 1696 px) is bigger, so it uses the follow camera.
const WHOLE_MAP_MAX_WIDTH_PX = 1600;
const WHOLE_MAP_MAX_HEIGHT_PX = 1200;

// Canvas size for big maps (and while the map is still loading); the camera follows you.
const FOLLOW_CANVAS_WIDTH_PX = 900;
const FOLLOW_CANVAS_HEIGHT_PX = 600;

// Zoom: 1 = one map pixel per screen pixel. Clamped, so you can't zoom into a single tile or out
// to a dot. Each + / − press multiplies or divides by ZOOM_STEP; each wheel notch by WHEEL_ZOOM_STEP.
const MIN_ZOOM = 0.3; // v6: the whole 110 × 80 floor fits on a laptop screen at 30 %
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_STEP = 1.1;
const FILL_START_ZOOM = 1.5;

// How quickly the camera catches up with me: 12% of the gap per frame at 60 FPS.
const CAMERA_GLIDE_PER_60FPS_FRAME = 0.12;

// How close (px) to the elevator's spot counts as "at the elevator" (press E).
const ELEVATOR_REACH_PX = 56;

// How long the "this is your desk" ring pulses, in ms.
const PULSE_MS = 6000;

// The dot colour when nobody told us someone's status.
const DEFAULT_DOT_COLOR = '#1fa971';

/**
 * Should we show the whole map at once (canvas = map size, camera fixed)?
 * true for maps up to 1600 × 1200 px when the canvas does not fill its parent.
 */
function canShowWholeMap(map, fill) {
  if (!map || fill) return false;
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

/** Keep a number between a smallest and a largest value. clamp(5, 0, 3) → 3 */
function clamp(value, smallest, largest) {
  return Math.min(largest, Math.max(smallest, value));
}

/** Is the keyboard focus in a text box? Then the keys are typing, not walking. */
function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
}

export function WorldCanvas({
  net,
  selfId = 'self',
  spawn,
  initialPlayers = [],
  onFrame,
  debug,
  fill = false,
  zoomable = false,
  controllerRef,
  avatarColor = '#22c55e',
  selfName = 'You',
  selfDotColorRef,
  peopleRef,
  overlayData,
  onZoomChange,
  onNearElevator,
  onAreaChange,
  mapData,
  showFps = false,
  background = '#090d16',
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [map, setMap] = useState(null);

  // The canvas size when it fills its parent (measured with a ResizeObserver).
  const [fillSize, setFillSize] = useState({ width: FOLLOW_CANVAS_WIDTH_PX, height: FOLLOW_CANVAS_HEIGHT_PX });

  // Player state managed via refs to avoid 60fps React state re-render bottlenecks
  const playerRef = useRef({
    x: spawn?.x || 150,
    y: spawn?.y || 150,
    speed: WALK_SPEED_PX_PER_SEC, // pixels per second
    dir: 'down',
  });

  // The camera: the map point at the middle of the screen, and the zoom. A ref, because it changes
  // every frame. null x means "not placed yet": the first frame puts it on me straight away.
  const cameraRef = useRef({ x: null, y: null, zoom: fill ? FILL_START_ZOOM : 1 });

  // The map drawn once on a hidden canvas (see renderMapToCanvas in map.js).
  const mapCanvasRef = useRef(null);

  // v6: one number per tile, 1 = wall (soundWalls.js), built once when the map loads.
  const wallGridRef = useRef(null);

  // The desk pulse: { x, y, startedAt } or null.
  const pulseRef = useRef(null);

  // Was I near the elevator in the last frame? (to call onNearElevator only when it changes)
  const nearElevatorRef = useRef(false);

  // Track other players (bots or remote peers)
  const othersRef = useRef(new Map());

  // Throttled position sending tracking
  // v6: starts at the spawn point, which the server already knows, so the first frame sends nothing
  // (otherwise that redundant move would use up the server's one free jump after joining, moveCheck.js).
  const lastSentRef = useRef({ time: 0, x: spawn?.x || 150, y: spawn?.y || 150, dir: 'down' });

  const keysRef = useRef({});

  // The latest initialPlayers, kept in a ref so the network effect below can read it
  // without restarting every time the parent passes a new (but equal) array.
  const initialPlayersRef = useRef(initialPlayers);
  initialPlayersRef.current = initialPlayers;

  // The office layer (department borders, closed wings, labels). Worked out only when the office
  // changes (useMemo), and read by the game loop from a ref, so a change never restarts the loop.
  const overlay = useMemo(() => buildOverlay(overlayData || {}), [overlayData]);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;

  // Callbacks and looks in refs too, for the same reason (the loop reads the latest).
  const looksRef = useRef({ avatarColor, selfName, onZoomChange, onNearElevator, onAreaChange, showFps });
  looksRef.current = { avatarColor, selfName, onZoomChange, onNearElevator, onAreaChange, showFps };

  // v6: the id of the area I stood in last frame ('' = none yet), to call onAreaChange only on a change.
  const areaIdRef = useRef('');

  // Populate initial players if provided
  useEffect(() => {
    addInitialPlayers(othersRef.current, initialPlayers, selfId);
  }, [initialPlayers, selfId]);

  // Load the map on mount. v6: `mapData` (a Tiled map object, e.g. the floor's stored layout) is used
  // when given; if it can't be used, or none was given, the static /maps/office.json.
  useEffect(() => {
    const load = mapData ? loadOfficeMap(mapData).then((loaded) => loaded || loadOfficeMap()) : loadOfficeMap();
    load.then((loadedMap) => {
      mapCanvasRef.current = renderMapToCanvas(loadedMap);
      wallGridRef.current = buildWallGrid(loadedMap); // v6: walls block sound (soundWalls.js)
      setMap(loadedMap);
    });
  }, [mapData]);

  // Fill mode: follow the parent's size (window resized, side panel opened or closed).
  useEffect(() => {
    if (!fill || !wrapperRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      setFillSize({ width, height });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [fill]);

  // The controller: what the page's buttons can ask the world to do.
  useEffect(() => {
    if (!controllerRef) return undefined;
    function setZoom(nextZoom) {
      cameraRef.current.zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      looksRef.current.onZoomChange?.(cameraRef.current.zoom);
    }
    controllerRef.current = {
      zoomIn: () => setZoom(cameraRef.current.zoom * ZOOM_STEP),
      zoomOut: () => setZoom(cameraRef.current.zoom / ZOOM_STEP),
      setZoom,
      getZoom: () => cameraRef.current.zoom,
      // Snap the camera back onto me.
      locate: () => {
        cameraRef.current.x = playerRef.current.x + 16;
        cameraRef.current.y = playerRef.current.y + 16;
      },
      // Jump straight to a spot (Ctrl+D "My desk", no path-finding) and tell the server at once.
      jumpTo: (x, y, dir = 'up') => {
        playerRef.current.x = x;
        playerRef.current.y = y;
        playerRef.current.dir = dir;
        cameraRef.current.x = x + 16;
        cameraRef.current.y = y + 16;
        if (net && typeof net.sendMove === 'function') {
          net.sendMove({ x, y, dir });
          lastSentRef.current = { time: performance.now(), x, y, dir };
        }
      },
      pulseAt: (x, y) => {
        pulseRef.current = { x, y, startedAt: performance.now() };
      },
      getPosition: () => ({ x: playerRef.current.x, y: playerRef.current.y }),
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, net]);

  // Mouse-wheel zoom (only when asked for, so the lab pages still scroll normally).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!zoomable || !canvas) return undefined;
    function handleWheel(event) {
      event.preventDefault(); // don't scroll the page
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
      cameraRef.current.zoom = clamp(cameraRef.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      looksRef.current.onZoomChange?.(cameraRef.current.zoom);
    }
    // passive: false lets us call preventDefault on the wheel event.
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoomable, map]);

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
    const handleKeyDown = (e) => {
      // Ctrl/Cmd shortcuts (e.g. Ctrl+D "My desk") and typing in a box are not walking.
      if (e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
      keysRef.current[e.key.toLowerCase()] = true;
    };
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

    // Small maps (not in fill mode) are shown whole; otherwise the camera follows me.
    const showWholeMap = canShowWholeMap(map, fill);

    // Can I stand at (x, y)? Walls and the outside (map.js), and closed wings (the office layer).
    const isBlocked = (x, y) => checkCollision(x, y, map) || isBlockedByOverlay(overlayRef.current, x, y);

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
        const overlayNow = overlayRef.current;
        const looks = looksRef.current;

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
        // Example: 220 px/s × 0.0167 s ≈ 3.7 px at 60 FPS, or ≈ 1.5 px at 144 FPS (same speed).
        // v6: hold Shift to run at twice the speed (440 px/s).
        const running = keys['shift'] === true && (dx !== 0 || dy !== 0);
        playerRef.current.running = running;
        const speed = running ? RUN_SPEED_PX_PER_SEC : playerRef.current.speed;
        const stepPx = speed * deltaSec;
        const nextX = playerRef.current.x + dx * stepPx;
        const nextY = playerRef.current.y + dy * stepPx;

        // Apply map collision checks (allowing sliding along walls)
        // x and y are checked separately: walking diagonally into a wall still moves you along it.
        if (!isBlocked(nextX, playerRef.current.y)) {
          playerRef.current.x = nextX;
        }
        if (!isBlocked(playerRef.current.x, nextY)) {
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

        // 4. Camera: which part of the map is on screen, and how big.
        // Whole-map mode: the middle of the map, zoom 1. Otherwise the camera glides after me
        // (same time-based glide as above), so walking feels smooth and a jump is a quick slide.
        const camera = cameraRef.current;
        const mapWidthPx = map ? map.width * map.tileSize : canvas.width;
        const mapHeightPx = map ? map.height * map.tileSize : canvas.height;
        if (showWholeMap) {
          camera.x = mapWidthPx / 2;
          camera.y = mapHeightPx / 2;
          camera.zoom = 1;
        } else {
          const targetX = playerRef.current.x + 16;
          const targetY = playerRef.current.y + 16;
          if (camera.x === null) {
            camera.x = targetX;
            camera.y = targetY;
          }
          const cameraGlide = 1 - Math.pow(1 - CAMERA_GLIDE_PER_60FPS_FRAME, deltaSec * 60);
          camera.x += (targetX - camera.x) * cameraGlide;
          camera.y += (targetY - camera.y) * cameraGlide;
        }
        const zoom = camera.zoom;
        // Whole screen pixels for the shift, so the pixel art never lands between two pixels (blurry).
        const shiftX = Math.round(canvas.width / 2 - camera.x * zoom);
        const shiftY = Math.round(canvas.height / 2 - camera.y * zoom);
        const toScreen = (worldX, worldY) => ({ x: worldX * zoom + shiftX, y: worldY * zoom + shiftY });
        const useWorldSpace = () => ctx.setTransform(zoom, 0, 0, zoom, shiftX, shiftY);
        const useScreenSpace = () => ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 5. Clear & draw the map (one picture copy; see renderMapToCanvas)
        useScreenSpace();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        useWorldSpace();
        ctx.imageSmoothingEnabled = false;
        if (mapCanvasRef.current) {
          ctx.drawImage(mapCanvasRef.current, 0, 0);
        }

        // 6. The office layer, under the avatars: department blocks, closed wings, elevator, pulse.
        let nearElevator = false;
        if (overlayNow) {
          drawDepartmentBlocks(ctx, overlayNow);
          drawClosedWings(ctx, overlayNow);
          const elevator = overlayNow.elevator;
          nearElevator = Math.hypot(playerRef.current.x - elevator.x, playerRef.current.y - elevator.y) <= ELEVATOR_REACH_PX;
          drawElevator(ctx, overlayNow, nearElevator);
        }
        if (nearElevator !== nearElevatorRef.current) {
          nearElevatorRef.current = nearElevator;
          looks.onNearElevator?.(nearElevator);
        }
        if (pulseRef.current) {
          if (currentTime - pulseRef.current.startedAt > PULSE_MS) pulseRef.current = null;
          else drawPulse(ctx, pulseRef.current, currentTime);
        }

        // 7. Avatars (world space): everyone else, then me on top.
        const people = peopleRef?.current || null;
        othersRef.current.forEach((other) => {
          const info = people ? people[other.id] : null;
          drawAvatar(ctx, other.x, other.y, info?.color || '#6366f1', other.dir, false);
        });
        if (playerRef.current.running) {
          drawRunLines(ctx, playerRef.current.x, playerRef.current.y, playerRef.current.dir, currentTime);
        }
        drawAvatar(ctx, playerRef.current.x, playerRef.current.y, looks.avatarColor, playerRef.current.dir, true);

        // 7b. v6: which area am I in? Inside a room, dim everything else (a dark film with the room cut out).
        const myArea = overlayNow ? areaAt(overlayNow.areas, playerRef.current.x, playerRef.current.y) : null;
        if (isClosedArea(myArea)) {
          drawAreaFocus(ctx, myArea, mapWidthPx, mapHeightPx);
        }
        const myAreaId = myArea ? myArea.id : null;
        if (myAreaId !== areaIdRef.current) {
          areaIdRef.current = myAreaId;
          looks.onAreaChange?.(myArea);
        }

        // 8. Debug overlay, world space part (the earshot ring around me)
        if (debug) {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = 1.5 / zoom;
          ctx.beginPath();
          // Same centre as the avatar's head (x + 16, y + 10), so the ring is really "100 px around me".
          ctx.arc(playerRef.current.x + 16, playerRef.current.y + 10, EARSHOT_PX, 0, Math.PI * 2); // 100px boundary
          ctx.stroke();
        }

        // 9. Screen space: labels keep the same size at every zoom.
        useScreenSpace();
        if (overlayNow) {
          drawOverlayLabels(ctx, overlayNow, toScreen, zoom);
        }
        othersRef.current.forEach((other) => {
          const info = people ? people[other.id] : null;
          const head = toScreen(other.x + 16, other.y - 2);
          drawNameTag(ctx, head.x, head.y, info?.name || other.name, info?.dotColor || DEFAULT_DOT_COLOR);
        });
        const myHead = toScreen(playerRef.current.x + 16, playerRef.current.y - 2);
        drawNameTag(ctx, myHead.x, myHead.y, looks.selfName, selfDotColorRef?.current || DEFAULT_DOT_COLOR);

        // v6: the office's FPS counter (F key): frames per second and how many people are drawn.
        if (looks.showFps) {
          const text = `FPS ${fps === null ? '…' : fps} · ${othersRef.current.size + 1} people`;
          ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
          const width = ctx.measureText(text).width + 20;
          ctx.fillStyle = 'rgba(15, 27, 45, 0.8)';
          ctx.fillRect(12, 12, width, 26);
          ctx.fillStyle = fps !== null && fps < 50 ? '#ffb4b4' : '#9ff0c4';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, 22, 25.5);
          ctx.textBaseline = 'alphabetic';
        }
        if (controllerRef?.current) controllerRef.current.lastFps = fps;

        if (debug) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px monospace';
          ctx.fillText(`FPS: ${fps === null ? '…' : fps}`, 15, 25);
          ctx.fillText(`Active Peers: ${othersRef.current.size}`, 15, 42);
          ctx.fillText(`Zoom: ${zoom.toFixed(2)}x`, 15, 59);
        }

        // 10. Report positions upstream to audio mixer via callback
        if (typeof onFrame === 'function') {
          // v6: blocked = a wall between us (open floor only; in a room the server's rules decide).
          // Only people within DISCONNECT_PX are checked: nobody farther away can be a voice anyway.
          const me = playerRef.current;
          const iAmInTheOpen = !isClosedArea(myArea);
          onFrame({
            self: { id: selfId, x: me.x, y: me.y },
            others: Array.from(othersRef.current.values()).map((o) => {
              let blocked = false;
              if (iAmInTheOpen && wallGridRef.current && Math.hypot(o.x - me.x, o.y - me.y) <= DISCONNECT_PX) {
                const theirArea = overlayNow ? areaAt(overlayNow.areas, o.x, o.y) : null;
                if (!isClosedArea(theirArea)) {
                  blocked = isWallBetween(wallGridRef.current, me.x + AVATAR_MIDDLE.x, me.y + AVATAR_MIDDLE.y, o.x + AVATAR_MIDDLE.x, o.y + AVATAR_MIDDLE.y);
                }
              }
              return { id: o.id, x: o.x, y: o.y, blocked };
            }),
          });
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [map, debug, selfId, onFrame, net, fill, peopleRef, selfDotColorRef]);

  // Canvas size: fill mode → the parent's size; a small map → the map's own size (whole office on
  // screen); otherwise the smaller follow-camera window.
  const showWholeMap = canShowWholeMap(map, fill);
  let canvasWidth = FOLLOW_CANVAS_WIDTH_PX;
  let canvasHeight = FOLLOW_CANVAS_HEIGHT_PX;
  if (fill) {
    canvasWidth = fillSize.width;
    canvasHeight = fillSize.height;
  } else if (showWholeMap) {
    canvasWidth = map.width * map.tileSize;
    canvasHeight = map.height * map.tileSize;
  }

  // width/height (attributes) = how many pixels we draw. In the labs the CSS only changes how big
  // it LOOKS: maxWidth 100% + height auto shrinks it evenly in a narrow window, while all
  // drawing code still uses map pixels. In fill mode the canvas is exactly its parent's size.
  return (
    <div ref={wrapperRef} style={fill ? { position: 'absolute', inset: 0 } : undefined}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={
          fill
            ? { display: 'block', width: '100%', height: '100%', background }
            : {
                display: 'block',
                margin: '0 auto',
                maxWidth: '100%',
                height: 'auto',
                background,
              }
        }
      />
    </div>
  );
}
