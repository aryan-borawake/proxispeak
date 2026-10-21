import React, { useState, useEffect, useRef } from 'react';
import { distanceToGain, dxToPan, generateVolumeTable, EARSHOT_PX } from './formulas';
import { createMixer } from './mixer';
import { AudioControls } from './AudioControls';

export function AudioLab() {
  const [audioStarted, setAudioStarted] = useState(false);
  const [activeTab, setActiveTab] = useState('draggable'); // 'sliders' | 'draggable' | 'multipeer'
  
  // Task 2: Slider state
  const [manualGain, setManualGain] = useState(0.5);
  const [manualPan, setManualPan] = useState(0.0);

  // Task 4: Draggable dot positions (radar center is 200, 200)
  const [selfPos] = useState({ x: 200, y: 200 });
  const [peerPos, setPeerPos] = useState({ x: 260, y: 200 }); // 60px to the right
  const [isDragging, setIsDragging] = useState(false);

  // Multi-peer simulation state
  const [multiPeersRunning, setMultiPeersRunning] = useState(false);

  // Live calculated metrics
  const dx = peerPos.x - selfPos.x;
  const dy = peerPos.y - selfPos.y;
  const distance = Math.round(Math.hypot(dx, dy));
  const calculatedGain = distanceToGain(distance);
  const calculatedPan = dxToPan(dx);

  // Mixer & audio node references
  const mixerRef = useRef(null);
  const toneGenRef = useRef(null);
  const manualOscRef = useRef(null);
  const manualGainNodeRef = useRef(null);
  const manualPanNodeRef = useRef(null);
  const multiPeersRef = useRef([]);
  const animLoopRef = useRef(null);

  // Initialize mixer on demand
  useEffect(() => {
    mixerRef.current = createMixer();
    return () => {
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
      if (toneGenRef.current) toneGenRef.current.stop();
      if (mixerRef.current) {
        mixerRef.current.removePeer('peer-single');
      }
    };
  }, []);

  // Handle starting audio context
  const handleStartAudio = async () => {
    if (!mixerRef.current) mixerRef.current = createMixer();
    await mixerRef.current.resume();
    setAudioStarted(true);

    // Create synthetic tone for the single draggable peer (440Hz Concert A)
    if (!toneGenRef.current) {
      toneGenRef.current = mixerRef.current.createSyntheticStream(440, 'SinglePeer');
      mixerRef.current.addPeer('peer-single', toneGenRef.current.stream);
    }
  };

  // Update mixer on every frame for draggable mode
  useEffect(() => {
    if (!audioStarted || !mixerRef.current) return;

    if (activeTab === 'draggable') {
      mixerRef.current.update({
        self: { id: 'self', x: selfPos.x, y: selfPos.y },
        others: [{ id: 'peer-single', x: peerPos.x, y: peerPos.y, blocked: false }]
      });
    }
  }, [audioStarted, peerPos, selfPos, activeTab]);

  // Handle dragging the fake avatar on the 2D radar
  const handleRadarMouseMove = (e) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(20, Math.min(380, e.clientX - rect.left));
    const y = Math.max(20, Math.min(380, e.clientY - rect.top));
    setPeerPos({ x, y });
  };

  // Task 7: Multi-peer simulation (3 avatars orbiting at different radii and speeds)
  const toggleMultiPeerSimulation = () => {
    if (!audioStarted) return;

    if (multiPeersRunning) {
      // Stop multi-peer
      setMultiPeersRunning(false);
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
      multiPeersRef.current.forEach(p => {
        mixerRef.current.removePeer(p.id);
        if (p.tone) p.tone.stop();
      });
      multiPeersRef.current = [];
      // Re-enable single peer
      if (toneGenRef.current) {
        mixerRef.current.addPeer('peer-single', toneGenRef.current.stream);
      }
    } else {
      // Start multi-peer
      setMultiPeersRunning(true);
      // Remove single peer
      mixerRef.current.removePeer('peer-single');

      // Create 3 peers with pleasant harmonious chords (C4, E4, G4)
      const peerConfigs = [
        { id: 'peer-alice', name: 'Alice (C4 - 261Hz)', freq: 261.63, radius: 45, speed: 0.015, angle: 0, color: '#38bdf8' },
        { id: 'peer-bob', name: 'Bob (E4 - 329Hz)', freq: 329.63, radius: 75, speed: -0.01, angle: Math.PI / 2, color: '#a855f7' },
        { id: 'peer-charlie', name: 'Charlie (G4 - 392Hz)', freq: 392.00, radius: 110, speed: 0.008, angle: Math.PI, color: '#f59e0b' }
      ];

      multiPeersRef.current = peerConfigs.map(cfg => {
        const tone = mixerRef.current.createSyntheticStream(cfg.freq, cfg.name);
        mixerRef.current.addPeer(cfg.id, tone.stream);
        return { ...cfg, tone };
      });

      // Animation loop to orbit peers around the center (200, 200)
      const animate = () => {
        multiPeersRef.current.forEach(p => {
          p.angle += p.speed;
          p.x = 200 + Math.cos(p.angle) * p.radius;
          p.y = 200 + Math.sin(p.angle) * p.radius;
        });

        mixerRef.current.update({
          self: { id: 'self', x: 200, y: 200 },
          others: multiPeersRef.current.map(p => ({ id: p.id, x: p.x, y: p.y, blocked: false }))
        });

        // Trigger re-render for UI updates
        setPeerPos(prev => ({ ...prev }));
        animLoopRef.current = requestAnimationFrame(animate);
      };

      animLoopRef.current = requestAnimationFrame(animate);
    }
  };

  const volumeTable = generateVolumeTable();

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#0f172a'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #e2e8f0',
        paddingBottom: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: '#1e293b' }}>
            🎧 ProxiSpeak — Audio Lab (Module 4)
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '14px' }}>
            Spatial Audio Mixer, Gain/Pan Nodes, and Distance Formulas
          </p>
        </div>

        <div>
          {!audioStarted ? (
            <button
              onClick={handleStartAudio}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              ▶️ Click to Enable Audio
            </button>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: '#dcfce7',
              color: '#15803d',
              borderRadius: '20px',
              fontWeight: '600',
              fontSize: '13px'
            }}>
              <span style={{ width: '8px', height: '8px', background: '#16a34a', borderRadius: '50%' }}></span>
              AudioContext Running
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { id: 'draggable', label: '🎯 Draggable Fake Avatar (Tasks 3 & 4)' },
          { id: 'multipeer', label: '👥 3-Peer Multi-Voice Orbit (Task 7)' },
          { id: 'sliders', label: '🎛️ Manual Sliders (Task 2)' },
          { id: 'table', label: '📊 Distance Formula Table' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: activeTab === tab.id ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: activeTab === tab.id ? '#eff6ff' : '#ffffff',
              color: activeTab === tab.id ? '#1d4ed8' : '#475569',
              fontWeight: activeTab === tab.id ? '700' : '500',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Draggable Avatar (Tasks 3 & 4) */}
      {activeTab === 'draggable' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '400px 1fr',
          gap: '24px',
          background: '#f8fafc',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          {/* Radar Canvas Area */}
          <div>
            <div
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onMouseMove={handleRadarMouseMove}
              style={{
                width: '400px',
                height: '400px',
                background: '#0f172a',
                borderRadius: '12px',
                position: 'relative',
                cursor: isDragging ? 'grabbing' : 'crosshair',
                overflow: 'hidden',
                userSelect: 'none'
              }}
            >
              {/* Earshot Range Circle (100px radius = 200px diameter) */}
              <div style={{
                position: 'absolute',
                top: `${200 - EARSHOT_PX}px`,
                left: `${200 - EARSHOT_PX}px`,
                width: `${EARSHOT_PX * 2}px`,
                height: `${EARSHOT_PX * 2}px`,
                borderRadius: '50%',
                border: '2px dashed #38bdf8',
                background: 'rgba(56, 189, 248, 0.08)',
                pointerEvents: 'none'
              }}>
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '11px',
                  color: '#38bdf8',
                  fontWeight: '600'
                }}>
                  Earshot 100px (Gain &gt; 0)
                </span>
              </div>

              {/* Connecting Line */}
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <line
                  x1={selfPos.x}
                  y1={selfPos.y}
                  x2={peerPos.x}
                  y2={peerPos.y}
                  stroke={distance <= EARSHOT_PX ? '#22c55e' : '#ef4444'}
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>

              {/* Self Avatar (Center) */}
              <div style={{
                position: 'absolute',
                top: `${selfPos.y - 14}px`,
                left: `${selfPos.x - 14}px`,
                width: '28px',
                height: '28px',
                background: '#3b82f6',
                border: '3px solid #ffffff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold',
                pointerEvents: 'none',
                boxShadow: '0 0 12px rgba(59, 130, 246, 0.8)'
              }}>
                You
              </div>

              {/* Peer Avatar (Draggable) */}
              <div style={{
                position: 'absolute',
                top: `${peerPos.y - 16}px`,
                left: `${peerPos.x - 16}px`,
                width: '32px',
                height: '32px',
                background: distance <= EARSHOT_PX ? '#10b981' : '#64748b',
                border: '3px solid #ffffff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold',
                boxShadow: '0 0 14px rgba(0,0,0,0.5)',
                cursor: 'grab'
              }}>
                👤
              </div>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '8px' }}>
              👆 <b>Click and drag the avatar</b> around to test distance attenuation and stereo panning!
            </p>
          </div>

          {/* Realtime Metrics & Controls */}
          <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', color: '#1e293b' }}>
              Live Spatial Calculations
            </h3>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Distance from You:</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: distance <= EARSHOT_PX ? '#16a34a' : '#dc2626' }}>
                  {distance} px {distance <= EARSHOT_PX ? ' (In Earshot)' : ' (Beyond 100px: Silent)'}
                </div>
              </div>

              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Volume (GainNode):</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#2563eb' }}>
                  {(calculatedGain * 100).toFixed(1)}% <span style={{ fontSize: '14px', color: '#64748b' }}>({calculatedGain.toFixed(3)})</span>
                </div>
                {/* Visual Volume Bar */}
                <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${calculatedGain * 100}%`, height: '100%', background: '#2563eb', transition: 'width 0.05s ease' }}></div>
                </div>
              </div>

              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Stereo Pan (StereoPannerNode):</span>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#7c3aed' }}>
                  {calculatedPan < -0.05 ? `Left Ear (${calculatedPan.toFixed(2)})` : calculatedPan > 0.05 ? `Right Ear (+${calculatedPan.toFixed(2)})` : `Centered (${calculatedPan.toFixed(2)})`}
                </div>
                {/* Visual Balance Bar */}
                <div style={{ position: 'relative', height: '10px', background: '#e2e8f0', borderRadius: '5px', marginTop: '8px' }}>
                  <div style={{
                    position: 'absolute',
                    top: '-3px',
                    left: `${((calculatedPan + 1) / 2) * 100}%`,
                    width: '16px',
                    height: '16px',
                    background: '#7c3aed',
                    borderRadius: '50%',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.05s ease'
                  }}></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  <span>◀ Full Left (-0.9)</span>
                  <span>Center (0.0)</span>
                  <span>Full Right (+0.9) ▶</span>
                </div>
              </div>

              <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '13px', color: '#1e40af' }}>How it works (Web Audio API):</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#1e3a8a', lineHeight: '1.4' }}>
                  The source audio stream passes through a <code>GainNode</code> (volume) and a <code>StereoPannerNode</code> (pan). As you drag the avatar, <code>mixer.update()</code> updates both nodes at 60 FPS using <code>setTargetAtTime()</code> to guarantee zero clicking noise.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 3-Peer Orbit Simulation (Task 7) */}
      {activeTab === 'multipeer' && (
        <div style={{
          background: '#f8fafc',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          textAlign: 'center'
        }}>
          <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#1e293b' }}>
            👥 Multi-Peer Audio Mixer Simulation (Task 7)
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '600px', margin: '0 auto 20px' }}>
            Simulates 3 distinct users (Alice, Bob, Charlie) walking in orbits around you at different distances and speeds, each playing a harmonious tone (C major chord: C4, E4, G4).
          </p>

          <button
            onClick={toggleMultiPeerSimulation}
            style={{
              background: multiPeersRunning ? '#ef4444' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              marginBottom: '20px'
            }}
          >
            {multiPeersRunning ? '⏹️ Stop 3-Peer Simulation' : '▶️ Start 3-Peer Simulation'}
          </button>

          {/* Multi-peer Radar Display */}
          <div style={{
            width: '400px',
            height: '400px',
            background: '#0f172a',
            borderRadius: '12px',
            margin: '0 auto',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Center "You" */}
            <div style={{
              position: 'absolute',
              top: '186px',
              left: '186px',
              width: '28px',
              height: '28px',
              background: '#3b82f6',
              border: '3px solid white',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold',
              boxShadow: '0 0 10px #3b82f6'
            }}>
              You
            </div>

            {/* Earshot Range */}
            <div style={{
              position: 'absolute',
              top: '100px',
              left: '100px',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              border: '1px dashed #38bdf8',
              pointerEvents: 'none'
            }} />

            {/* Render active orbiting peers */}
            {multiPeersRef.current.map(p => (
              <div
                key={p.id}
                style={{
                  position: 'absolute',
                  top: `${(p.y || 200) - 14}px`,
                  left: `${(p.x || 200) - 14}px`,
                  width: '28px',
                  height: '28px',
                  background: p.color,
                  border: '2px solid white',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  boxShadow: `0 0 10px ${p.color}`
                }}
              >
                {p.id === 'peer-alice' ? 'A' : p.id === 'peer-bob' ? 'B' : 'C'}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px' }}>
            <span style={{ fontSize: '13px', color: '#38bdf8' }}>🔵 Alice: 45px (Close, Loud)</span>
            <span style={{ fontSize: '13px', color: '#a855f7' }}>🟣 Bob: 75px (Medium)</span>
            <span style={{ fontSize: '13px', color: '#f59e0b' }}>🟠 Charlie: 110px (Beyond earshot, Fades Out)</span>
          </div>
        </div>
      )}

      {/* Tab 3: Sliders (Task 2) */}
      {activeTab === 'sliders' && (
        <div style={{
          background: '#f8fafc',
          padding: '24px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          maxWidth: '500px',
          margin: '0 auto'
        }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '18px', color: '#1e293b' }}>
            🎛️ Manual Gain & Pan Test (Task 2)
          </h2>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Gain (Volume): {(manualGain * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={manualGain}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setManualGain(val);
                if (mixerRef.current && audioStarted) {
                  mixerRef.current.update({
                    self: { id: 'self', x: 200, y: 200 },
                    others: [{ id: 'peer-single', x: 200 + manualPan * 80, y: 200 + (1 - val) * 100 }]
                  });
                }
              }}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
              Stereo Pan: {manualPan.toFixed(2)} ({manualPan < 0 ? 'Left' : manualPan > 0 ? 'Right' : 'Center'})
            </label>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={manualPan}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setManualPan(val);
                if (mixerRef.current && audioStarted) {
                  mixerRef.current.update({
                    self: { id: 'self', x: 200, y: 200 },
                    others: [{ id: 'peer-single', x: 200 + val * 80, y: 200 + (1 - manualGain) * 100 }]
                  });
                }
              }}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}

      {/* Tab 4: Formula Diagnostics Table (Task 3) */}
      {activeTab === 'table' && (
        <div style={{
          background: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '18px', color: '#1e293b' }}>
            📊 Distance to Gain Comparison Table (Task 3)
          </h2>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
            Volume must be 0 at and beyond 100px (Infotact spec requirement). We compare linear, half-cosine smooth, and quadratic curves.
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '8px 12px' }}>Distance (px)</th>
                <th style={{ padding: '8px 12px' }}>Smooth (Chosen)</th>
                <th style={{ padding: '8px 12px' }}>Linear</th>
                <th style={{ padding: '8px 12px' }}>Quadratic</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {volumeTable.map(row => (
                <tr key={row.distance} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: '600' }}>{row.distance} px</td>
                  <td style={{ padding: '8px 12px', color: '#2563eb', fontWeight: '600' }}>{row.smoothGain}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.linearGain}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.quadraticGain}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {row.distance >= 100 ? (
                      <span style={{ color: '#dc2626', fontWeight: '600' }}>Silent (0.0)</span>
                    ) : (
                      <span style={{ color: '#16a34a' }}>Audible</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
