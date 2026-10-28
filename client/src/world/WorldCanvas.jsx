// client/src/world/WorldCanvas.jsx — Person 3
import React, { useEffect, useRef, useState } from 'react';
import { loadOfficeMap, drawMap, checkCollision } from './map';
import { MOVE_SEND_HZ, EARSHOT_PX } from '@shared/constants.js';

export function WorldCanvas({ net, selfId = 'self', spawn, initialPlayers = [], onFrame, debug }) {
  const canvasRef = useRef(null);
  const [map, setMap] = useState(null);

  // Player state managed via refs to avoid 60fps React state re-render bottlenecks
  const playerRef = useRef({
    x: spawn?.x || 150,
    y: spawn?.y || 150,
    speed: 3,
    dir: 'down',
  });

  // Track other players (bots or remote peers)
  const othersRef = useRef(new Map());

  // Throttled position sending tracking
  const lastSentRef = useRef({ time: 0, x: 0, y: 0, dir: 'down' });

  const keysRef = useRef({});

  // Populate initial players if provided
  useEffect(() => {
    if (Array.isArray(initialPlayers)) {
      initialPlayers.forEach((p) => {
        if (p.id !== selfId) {
          othersRef.current.set(p.id, {
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
  }, [initialPlayers, selfId]);

  // Load map metadata on mount
  useEffect(() => {
    loadOfficeMap().then((loadedMap) => {
      setMap(loadedMap);
    });
  }, []);

  // Listen to network events (real server or fakeNet)
  useEffect(() => {
    if (!net) return;

    // Reset other players when the network restarts or reconnects
    othersRef.current.clear();

    // Handle players state broadcast (10x a second)
    const unsubState = net.onPlayersState?.((state) => {
      if (!state || !Array.isArray(state.players)) return;

      const activeIds = new Set();

      state.players.forEach((p) => {
        if (p.id === selfId) return; // Don't overwrite local player
        activeIds.add(p.id);

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

      // Remove any players who left or are no longer in the room broadcast
      for (const id of othersRef.current.keys()) {
        if (!activeIds.has(id)) {
          othersRef.current.delete(id);
        }
      }
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
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    const sendIntervalMs = 1000 / MOVE_SEND_HZ; // 100 ms

    const render = (currentTime) => {
      lastTime = currentTime;

      // FPS tracking
      frameCount++;
      if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
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

        const nextX = playerRef.current.x + dx * playerRef.current.speed;
        const nextY = playerRef.current.y + dy * playerRef.current.speed;

        // Apply map collision checks (allowing sliding along walls)
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
          other.x += (other.targetX - other.x) * 0.15;
          other.y += (other.targetY - other.y) * 0.15;
        });

        // 4. Camera Viewport Follow Logic
        const camera = {
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
          ctx.arc(renderX + 16, renderY + 20, EARSHOT_PX, 0, Math.PI * 2); // 100px boundary
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px monospace';
          ctx.fillText(`FPS: ${fps}`, 15, 25);
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

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={600}
        style={{ display: 'block', background: '#090d16' }}
      />
    </div>
  );
}
