// client/src/world/WorldLab.jsx — Person 3
import React from 'react';
import { WorldCanvas } from './WorldCanvas.jsx';

export function WorldLab() {
  return (
    <section style={{ padding: '20px', fontFamily: 'sans-serif', color: '#f8fafc', background: '#090d16', minHeight: '100vh' }}>
      <h2>Module 3 Lab: 2D World Canvas</h2>
      <p>Owner: Person 3 (Anjali). Task 1 complete: Canvas rendered with a test rectangle.</p>
      
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