import React, { useEffect, useState, useRef } from 'react';
import { createMicMeter } from './micMeter';

/**
 * AudioControls Component
 * Provides a microphone volume meter bar and a toggle mute button.
 */
export function AudioControls({ micStream, muted = false, onToggleMute }) {
  const [level, setLevel] = useState(0);
  const meterRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (!micStream) return;

    meterRef.current = createMicMeter(micStream);

    const checkLevel = () => {
      if (meterRef.current) {
        setLevel(meterRef.current.getLevel());
      }
      animFrameRef.current = requestAnimationFrame(checkLevel);
    };

    animFrameRef.current = requestAnimationFrame(checkLevel);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (meterRef.current) {
        meterRef.current.stop();
      }
    };
  }, [micStream]);

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '12px',
      background: '#1e293b',
      padding: '8px 16px',
      borderRadius: '24px',
      color: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      border: '1px solid #334155'
    }}>
      <button
        onClick={onToggleMute}
        style={{
          background: muted ? '#ef4444' : '#10b981',
          color: 'white',
          border: 'none',
          padding: '8px 14px',
          borderRadius: '16px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'background 0.2s ease',
        }}
      >
        {muted ? '🔇 Muted' : '🎙️ Mic Active'}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Level:</span>
        <div style={{
          width: '70px',
          height: '8px',
          background: '#0f172a',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            width: `${Math.round(level * 100)}%`,
            height: '100%',
            background: level > 0.7 ? '#f59e0b' : '#38bdf8',
            transition: 'width 0.05s ease',
            borderRadius: '4px'
          }} />
        </div>
      </div>
    </div>
  );
}
