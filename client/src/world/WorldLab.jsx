// client/src/world/WorldLab.jsx — Person 3
import React, { useEffect, useState } from 'react';
import { WorldCanvas } from './WorldCanvas.jsx';
import { createFakeNet } from './fakeNet.js';

export function WorldLab() {
  // 5 bots on first load (after a refresh it goes back to 5; we don't store it).
  const [botCount, setBotCount] = useState(5);
  const [showDebug, setShowDebug] = useState(false);

  // The fake network (with its wandering bots). null until the effect below creates it.
  const [fakeNet, setFakeNet] = useState(null);

  // Create the fake net INSIDE an effect, and destroy that same one in the effect's cleanup.
  //
  // Why not useMemo (the old code)? In development, React StrictMode (main.jsx) mounts the
  // page, unmounts it and mounts it again, to find bugs. useMemo kept the SAME fake net
  // through that, but the cleanup in between destroyed it (stopped the bots' timer), so the
  // bots never appeared until a bot button made a new one.
  //
  // With an effect, each mount creates its own fake net and each cleanup destroys only its own:
  //   mount → create net A → cleanup → destroy A → mount again → create net B (B is used).
  // Changing the bot count does the same: destroy the old net, create a new one.
  useEffect(() => {
    const createdNet = createFakeNet({ bots: botCount });
    setFakeNet(createdNet);
    return () => {
      createdNet.destroy();
    };
  }, [botCount]);

  return (
    <section style={{ padding: '20px', fontFamily: 'sans-serif', color: '#f8fafc', background: '#090d16', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '900px', margin: '0 auto 15px auto' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Module 3 Lab: 2D World Canvas</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
            Walk around with <b>Arrow Keys</b> or <b>WASD</b>. Explore your custom office!
          </p>
        </div>

        {/* Controls: Bot Count & Debug Toggle */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowDebug((prev) => !prev)}
            style={{
              background: showDebug ? '#3b82f6' : '#1e293b',
              color: '#ffffff',
              border: '1px solid #475569',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '12px',
              marginRight: '6px',
            }}
          >
            {showDebug ? '🔵 Debug Circle: ON' : '⚪ Debug Circle: OFF'}
          </button>

          <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Bots:</span>
          {[1, 3, 5, 50].map((num) => (
            <button
              key={num}
              onClick={() => setBotCount(num)}
              style={{
                background: botCount === num ? '#3b82f6' : '#1e293b',
                color: '#ffffff',
                border: '1px solid #475569',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: botCount === num ? 'bold' : 'normal',
              }}
            >
              {num === 50 ? '50 (Stress Test)' : `${num}`}
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <WorldCanvas
          net={fakeNet}
          selfId="anjali-local"
          spawn={{ x: 150, y: 150 }}
          onFrame={(frame) => {
            // Frame coordinates reported to audio mixer in App.jsx
          }}
          debug={showDebug}
        />
      </div>
    </section>
  );
}
