// client/src/world/WorldLab.jsx — Person 3
import React from 'react';
import { WorldCanvas } from './WorldCanvas.jsx';

export function WorldLab() {
  return (
    <section style={{ padding: '20px', fontFamily: 'sans-serif', color: '#f8fafc', background: '#090d16', minHeight: '100vh' }}>
      <h2>Module 3 Lab: 2D World Canvas</h2>
      
      <div style={{ marginTop: '20px' }}>
        <WorldCanvas
          net={null}
          selfId="anjali-local"
          spawn={{ x: 150, y: 150 }}
          initialPlayers={[]}
          onFrame={() => {}}
          debug={true}
        />
      </div>
    </section>
  );
}