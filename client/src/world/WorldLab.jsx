// client/src/world/WorldLab.jsx — Person 3
import React, { useEffect, useState, useMemo } from 'react';
import { WorldCanvas } from './WorldCanvas.jsx';
import { createFakeNet } from './fakeNet.js';

export function WorldLab() {
  const [botCount, setBotCount] = useState(3);
  const [showDebug, setShowDebug] = useState(false);

  // Initialize fake network with wandering bots
  const fakeNet = useMemo(() => {
    return createFakeNet({ bots: botCount });
  }, [botCount]);

  useEffect(() => {
    return () => {
      fakeNet.destroy();
    };
  }, [fakeNet]);

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
