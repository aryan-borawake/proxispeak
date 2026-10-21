// client/src/world/WorldCanvas.jsx — Person 3
import React, { useEffect, useRef, useState } from 'react';
import { loadOfficeMap, drawMap, checkCollision } from './map';

export function WorldCanvas({ net, selfId, spawn, initialPlayers, onFrame, debug }) {
  const canvasRef = useRef(null);
  const [map, setMap] = useState(null);

  // Player state managed via refs to avoid 60fps React state re-render bottlenecks
  const playerRef = useRef({
    x: spawn?.x || 320,
    y: spawn?.y || 320,
    speed: 3,
    dir: 'down'
  });

  const keysRef = useRef({});

  // Load map metadata on mount
  useEffect(() => {
    loadOfficeMap().then((loadedMap) => {
      setMap(loadedMap);
    });
  }, []);

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

    const render = (currentTime) => {
      const deltaTime = (currentTime - lastTime) / 1000;
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

        // Apply map collision bounds check
        if (!checkCollision(nextX, playerRef.current.y, map)) {
          playerRef.current.x = nextX;
        }
        if (!checkCollision(playerRef.current.x, nextY, map)) {
          playerRef.current.y = nextY;
        }

        // 2. Camera Viewport Follow Logic
        const camera = {
          x: playerRef.current.x - canvas.width / 2,
          y: playerRef.current.y - canvas.height / 2,
        };

        // 3. Clear & Render Map Layout
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawMap(ctx, map, camera);

        // 4. Draw Local Player Avatar
        const renderX = playerRef.current.x - camera.x;
        const renderY = playerRef.current.y - camera.y;

        ctx.fillStyle = '#22c55e'; // Green indicator for local user ("You")
        ctx.beginPath();
        ctx.arc(renderX + 16, renderY + 10, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(renderX + 8, renderY + 16, 16, 20);

        // Name Tag & Status ("You")
        ctx.fillStyle = '#ffffff';
        ctx.font = '11px sans-serif';
        ctx.fillText('● You', renderX - 4, renderY - 4);

        // 5. Debug Overlay (FPS Counter & Earshot Range Circle)
        if (debug) {
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(renderX + 16, renderY + 20, 100, 0, Math.PI * 2); // 100px earshot boundary
          ctx.stroke();

          ctx.fillStyle = '#38bdf8';
          ctx.font = '12px monospace';
          ctx.fillText(`FPS: ${fps}`, 15, 25);
        }

        // 6. Report position back upstream to parent/mixer via callback
        if (typeof onFrame === 'function') {
          onFrame({
            self: { id: selfId, x: playerRef.current.x, y: playerRef.current.y },
            others: []
          });
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [map, debug, selfId, onFrame]);

  return (
    <div style={{ textAlign: 'center' }}>
      <canvas
        ref={canvasRef}
        width={900}
        height={600}
        style={{ border: '3px solid #334155', borderRadius: '8px', background: '#090d16', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}
      />
    </div>
  );
}