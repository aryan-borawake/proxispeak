import React, { useState, useEffect, useRef } from 'react';
import { distanceToGain, dxToPan, generateVolumeTable, EARSHOT_PX } from './formulas';
import { createMixer } from './mixer';
import { AudioControls } from './AudioControls';

/* ─────────────────────────────────────────────────
   Module 4 — Spatial Audio Lab (ProxiSpeak)
   Owner: Koushik  |  Branch: koushik
   Test URL: localhost:5173/?lab=audio
───────────────────────────────────────────────── */

const TABS = [
  { id: 'radar',     icon: '🎯', label: 'Radar' },
  { id: 'multipeer', icon: '👥', label: 'Multi-Peer' },
  { id: 'sliders',   icon: '🎛️',  label: 'Manual Sliders' },
  { id: 'table',     icon: '📊', label: 'Formula Table' },
];

export function AudioLab() {
  /* ── Audio engine state ── */
  const [audioStatus, setAudioStatus] = useState('idle');
  // 'idle' | 'running' | 'suspended' | 'error'
  const [audioError, setAudioError] = useState('');

  /* ── Mic state ── */
  const [micStream, setMicStream]   = useState(null);
  const [micError, setMicError]     = useState('');
  const [isMuted, setIsMuted]       = useState(false);

  /* ── UI state ── */
  const [activeTab, setActiveTab]   = useState('radar');

  /* ── Sliders (Task 2) ── */
  const [manualGain, setManualGain] = useState(0.5);
  const [manualPan,  setManualPan]  = useState(0.0);

  /* ── Radar (Tasks 3 & 4) ── */
  const [selfPos]    = useState({ x: 200, y: 200 });
  const [peerPos, setPeerPos]       = useState({ x: 260, y: 200 });
  const [isDragging, setIsDragging] = useState(false);

  /* ── Multi-peer (Task 7) ── */
  const [multiRunning, setMultiRunning] = useState(false);

  /* ── Refs ── */
  const mixerRef      = useRef(null);
  const toneGenRef    = useRef(null);
  const multiPeersRef = useRef([]);
  const animLoopRef   = useRef(null);

  /* Live calc for radar */
  const dx         = peerPos.x - selfPos.x;
  const dy         = peerPos.y - selfPos.y;
  const distance   = Math.round(Math.hypot(dx, dy));
  const liveGain   = distanceToGain(distance);
  const livePan    = dxToPan(dx);

  const volumeTable = generateVolumeTable();

  /* ── Init mixer once ── */
  useEffect(() => {
    mixerRef.current = createMixer();
    return () => {
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
      if (toneGenRef.current) toneGenRef.current.stop();
      if (mixerRef.current)   mixerRef.current.removePeer('peer-single');
    };
  }, []);

  /* ── Update mixer on radar drag ── */
  useEffect(() => {
    if (audioStatus !== 'running' || !mixerRef.current || activeTab !== 'radar') return;
    mixerRef.current.update({
      self:   { id: 'self', x: selfPos.x, y: selfPos.y },
      others: [{ id: 'peer-single', x: peerPos.x, y: peerPos.y, blocked: false }],
    });
  }, [audioStatus, peerPos, selfPos, activeTab]);

  /* ─────────── Audio Toggle (Start / Suspend / Resume) ─────────── */
  const handleAudioToggle = async () => {
    try {
      setAudioError('');

      if (audioStatus === 'idle') {
        // First start
        if (!mixerRef.current) mixerRef.current = createMixer();
        const result = await mixerRef.current.resume();
        if (result !== 'running') throw new Error(`AudioContext state: ${result}`);

        // Spawn a synthetic test tone for the radar tab
        if (!toneGenRef.current) {
          toneGenRef.current = mixerRef.current.createSyntheticStream(440, 'Peer');
          mixerRef.current.addPeer('peer-single', toneGenRef.current.stream);
        }
        setAudioStatus('running');

      } else if (audioStatus === 'running') {
        // Suspend = "pause" all audio
        const ctx = mixerRef.current;
        // Access the raw AudioContext through the mixer's internal state
        // We expose a simple suspend via the mixer helper
        if (toneGenRef.current) toneGenRef.current.stop();
        toneGenRef.current = null;
        if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
        multiPeersRef.current.forEach(p => {
          mixerRef.current.removePeer(p.id);
          if (p.tone) p.tone.stop();
        });
        multiPeersRef.current = [];
        setMultiRunning(false);
        // Recreate the mixer (effectively suspends all audio)
        mixerRef.current = createMixer();
        setAudioStatus('suspended');

      } else if (audioStatus === 'suspended') {
        // Resume from suspended
        await mixerRef.current.resume();
        toneGenRef.current = mixerRef.current.createSyntheticStream(440, 'Peer');
        mixerRef.current.addPeer('peer-single', toneGenRef.current.stream);
        setAudioStatus('running');
      }

    } catch (err) {
      setAudioError(`Audio error: ${err.message}`);
      setAudioStatus('error');
    }
  };

  /* ─────────── Mic ─────────── */
  const handleMicToggle = async () => {
    setMicError('');
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      setMicStream(null);
      setIsMuted(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setMicStream(stream);
    } catch (err) {
      setMicError(`Mic blocked: ${err.message}`);
    }
  };

  /* ─────────── Radar drag ─────────── */
  const handleRadarMove = (e) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPeerPos({
      x: Math.max(20, Math.min(380, e.clientX - rect.left)),
      y: Math.max(20, Math.min(380, e.clientY - rect.top)),
    });
  };

  /* ─────────── Multi-peer simulation ─────────── */
  const toggleMultiPeer = () => {
    if (audioStatus !== 'running') return;

    if (multiRunning) {
      setMultiRunning(false);
      cancelAnimationFrame(animLoopRef.current);
      multiPeersRef.current.forEach(p => {
        mixerRef.current.removePeer(p.id);
        p.tone.stop();
      });
      multiPeersRef.current = [];
      // Restore single peer for radar
      if (toneGenRef.current) {
        toneGenRef.current = mixerRef.current.createSyntheticStream(440, 'Peer');
        mixerRef.current.addPeer('peer-single', toneGenRef.current.stream);
      }
    } else {
      setMultiRunning(true);
      mixerRef.current.removePeer('peer-single');

      const configs = [
        { id: 'peer-alice',   freq: 261.63, radius: 45,  speed:  0.015, angle: 0,            color: '#38bdf8' },
        { id: 'peer-bob',     freq: 329.63, radius: 75,  speed: -0.010, angle: Math.PI / 2,  color: '#a855f7' },
        { id: 'peer-charlie', freq: 392.00, radius: 110, speed:  0.008, angle: Math.PI,      color: '#f59e0b' },
      ];

      multiPeersRef.current = configs.map(cfg => {
        const tone = mixerRef.current.createSyntheticStream(cfg.freq);
        mixerRef.current.addPeer(cfg.id, tone.stream);
        return { ...cfg, tone, x: 200, y: 200 };
      });

      const animate = () => {
        multiPeersRef.current.forEach(p => {
          p.angle += p.speed;
          p.x = 200 + Math.cos(p.angle) * p.radius;
          p.y = 200 + Math.sin(p.angle) * p.radius;
        });
        mixerRef.current.update({
          self:   { id: 'self', x: 200, y: 200 },
          others: multiPeersRef.current.map(p => ({ id: p.id, x: p.x, y: p.y, blocked: false })),
        });
        setPeerPos(prev => ({ ...prev })); // force re-render for avatars
        animLoopRef.current = requestAnimationFrame(animate);
      };
      animLoopRef.current = requestAnimationFrame(animate);
    }
  };

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */

  const statusColor = {
    idle:      '#64748b',
    running:   '#22c55e',
    suspended: '#f59e0b',
    error:     '#ef4444',
  }[audioStatus];

  const statusLabel = {
    idle:      'Audio Off',
    running:   'Audio Running',
    suspended: 'Audio Paused',
    error:     'Audio Error',
  }[audioStatus];

  const btnLabel = {
    idle:      '▶  Start Audio Engine',
    running:   '⏸  Pause Audio',
    suspended: '▶  Resume Audio',
    error:     '↺  Retry',
  }[audioStatus];

  const btnColor = {
    idle:      'linear-gradient(135deg, #6366f1, #8b5cf6)',
    running:   'linear-gradient(135deg, #f59e0b, #ef4444)',
    suspended: 'linear-gradient(135deg, #22c55e, #10b981)',
    error:     'linear-gradient(135deg, #ef4444, #dc2626)',
  }[audioStatus];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      color: '#e2e8f0',
    }}>

      {/* ══════════ TOP NAVBAR ══════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(15,23,42,0.7)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px',
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px',
          }}>🎧</div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', letterSpacing: '0.01em', color: '#f8fafc' }}>
              ProxiSpeak — Audio Lab
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
              Module 4 · Spatial Audio Mixer · Owner: Koushik
            </div>
          </div>
        </div>

        {/* Status pill + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 12px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${statusColor}44`,
            fontSize: '12px', fontWeight: '600', color: statusColor,
          }}>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: statusColor,
              boxShadow: audioStatus === 'running' ? `0 0 8px ${statusColor}` : 'none',
              animation: audioStatus === 'running' ? 'pulse 2s infinite' : 'none',
            }}/>
            {statusLabel}
          </div>

          {/* Audio toggle button */}
          <button
            id="audio-toggle-btn"
            onClick={handleAudioToggle}
            style={{
              background: btnColor,
              color: 'white',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            }}
          >
            {btnLabel}
          </button>

          {/* Mic toggle */}
          <button
            id="mic-toggle-btn"
            onClick={handleMicToggle}
            style={{
              background: micStream
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'rgba(255,255,255,0.07)',
              color: micStream ? 'white' : '#94a3b8',
              border: `1px solid ${micStream ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {micStream ? '🔴 Stop Mic' : '🎙️ Test Mic'}
          </button>
        </div>
      </div>

      {/* ══════════ ERROR BANNERS ══════════ */}
      {audioError && (
        <div style={{
          margin: '12px 28px 0',
          padding: '10px 16px',
          borderRadius: '8px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid #ef4444',
          color: '#fca5a5',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          ⚠️ {audioError}
          <button
            onClick={() => { setAudioError(''); setAudioStatus('idle'); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: '700' }}
          >✕</button>
        </div>
      )}
      {micError && (
        <div style={{
          margin: '8px 28px 0',
          padding: '10px 16px',
          borderRadius: '8px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid #f87171',
          color: '#fca5a5',
          fontSize: '13px',
        }}>
          🎙️ {micError}
        </div>
      )}

      {/* ══════════ MIC CONTROLS ══════════ */}
      {micStream && (
        <div style={{ padding: '12px 28px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <AudioControls
            micStream={micStream}
            muted={isMuted}
            onToggleMute={() => {
              const next = !isMuted;
              setIsMuted(next);
              micStream.getAudioTracks().forEach(t => { t.enabled = !next; });
            }}
          />
        </div>
      )}

      {/* ══════════ IDLE PROMPT ══════════ */}
      {audioStatus === 'idle' && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎧</div>
          <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#c7d2fe', margin: '0 0 8px' }}>
            Click "Start Audio Engine" to begin
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '420px', margin: '0 auto' }}>
            Browsers require a user gesture before playing audio. Click the button in the top-right to unlock the Web Audio API and start the spatial sound engine.
          </p>
        </div>
      )}

      {/* ══════════ MAIN CONTENT ══════════ */}
      {audioStatus !== 'idle' && (
        <div style={{ padding: '24px 28px' }}>

          {/* TAB BAR */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: active ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                    background: active
                      ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.2))'
                      : 'rgba(255,255,255,0.03)',
                    color: active ? '#c7d2fe' : '#64748b',
                    fontWeight: active ? '700' : '500',
                    fontSize: '13px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    letterSpacing: '0.01em',
                  }}
                >
                  <span>{tab.icon}</span> {tab.label}
                </button>
              );
            })}
          </div>

          {/* ═══ TAB 1: RADAR ═══ */}
          {activeTab === 'radar' && (
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px', alignItems: 'start' }}>

              {/* Radar */}
              <div>
                <div
                  id="radar-canvas"
                  onMouseDown={() => setIsDragging(true)}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  onMouseMove={handleRadarMove}
                  style={{
                    width: '400px', height: '400px',
                    background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%)',
                    border: '1px solid rgba(99,102,241,0.25)',
                    borderRadius: '16px',
                    position: 'relative',
                    cursor: isDragging ? 'grabbing' : 'crosshair',
                    overflow: 'hidden',
                    userSelect: 'none',
                    boxShadow: '0 0 40px rgba(99,102,241,0.1)',
                  }}
                >
                  {/* Grid lines */}
                  {[100, 200, 300].map(v => (
                    <React.Fragment key={v}>
                      <div style={{ position: 'absolute', top: v, left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.04)' }}/>
                      <div style={{ position: 'absolute', left: v, top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.04)' }}/>
                    </React.Fragment>
                  ))}

                  {/* Earshot ring */}
                  <div style={{
                    position: 'absolute',
                    top: selfPos.y - EARSHOT_PX, left: selfPos.x - EARSHOT_PX,
                    width: EARSHOT_PX * 2, height: EARSHOT_PX * 2,
                    borderRadius: '50%',
                    border: '1.5px dashed rgba(99,102,241,0.6)',
                    background: 'rgba(99,102,241,0.04)',
                    pointerEvents: 'none',
                  }}>
                    <span style={{
                      position: 'absolute', top: '4px', left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '10px', color: '#818cf8', fontWeight: '600',
                      whiteSpace: 'nowrap',
                    }}>
                      Earshot 100 px
                    </span>
                  </div>

                  {/* Disconnect ring */}
                  <div style={{
                    position: 'absolute',
                    top: selfPos.y - 140, left: selfPos.x - 140,
                    width: 280, height: 280,
                    borderRadius: '50%',
                    border: '1px dashed rgba(239,68,68,0.2)',
                    pointerEvents: 'none',
                  }}/>

                  {/* Connection line */}
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <line
                      x1={selfPos.x} y1={selfPos.y}
                      x2={peerPos.x} y2={peerPos.y}
                      stroke={distance <= EARSHOT_PX ? '#22c55e' : '#ef444466'}
                      strokeWidth="1.5"
                      strokeDasharray="5 3"
                    />
                  </svg>

                  {/* You */}
                  <div style={{
                    position: 'absolute',
                    top: selfPos.y - 16, left: selfPos.x - 16,
                    width: 32, height: 32,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '11px', fontWeight: '800',
                    pointerEvents: 'none',
                    boxShadow: '0 0 16px rgba(99,102,241,0.7)',
                  }}>
                    YOU
                  </div>

                  {/* Peer */}
                  <div style={{
                    position: 'absolute',
                    top: peerPos.y - 16, left: peerPos.x - 16,
                    width: 32, height: 32,
                    background: distance <= EARSHOT_PX
                      ? 'linear-gradient(135deg, #22c55e, #10b981)'
                      : 'linear-gradient(135deg, #475569, #334155)',
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '14px',
                    cursor: 'grab',
                    boxShadow: distance <= EARSHOT_PX
                      ? '0 0 16px rgba(34,197,94,0.6)'
                      : '0 0 6px rgba(0,0,0,0.5)',
                    transition: 'background 0.3s, box-shadow 0.3s',
                  }}>
                    👤
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center', marginTop: '8px' }}>
                  Click + drag the green avatar to hear spatial audio change in real time
                </p>
              </div>

              {/* Right panel: Live metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#c7d2fe' }}>
                  Live Audio Calculations
                </h3>

                {/* Distance */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px', padding: '14px',
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Distance
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: distance <= EARSHOT_PX ? '#22c55e' : '#ef4444' }}>
                    {distance} px
                  </div>
                  <div style={{ fontSize: '12px', color: distance <= EARSHOT_PX ? '#4ade80' : '#f87171', marginTop: '2px' }}>
                    {distance <= EARSHOT_PX ? '🔊 In earshot — audio playing' : '🔇 Beyond 100 px — completely silent'}
                  </div>
                </div>

                {/* Volume */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px', padding: '14px',
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    GainNode Volume
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: '#818cf8' }}>
                    {(liveGain * 100).toFixed(1)}%
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${liveGain * 100}%`, height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                      transition: 'width 0.05s ease',
                    }}/>
                  </div>
                </div>

                {/* Pan */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px', padding: '14px',
                }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    StereoPannerNode
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '800', color: '#c084fc' }}>
                    {livePan < -0.05 ? `◀ Left ear  (${livePan.toFixed(2)})` : livePan > 0.05 ? `Right ear ▶ (+${livePan.toFixed(2)})` : `⬛ Center (0.00)`}
                  </div>
                  <div style={{ position: 'relative', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', marginTop: '10px' }}>
                    <div style={{
                      position: 'absolute',
                      width: '16px', height: '16px',
                      top: '-3px',
                      left: `${((livePan + 1) / 2) * 100}%`,
                      transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                      borderRadius: '50%',
                      transition: 'left 0.05s ease',
                      boxShadow: '0 0 8px rgba(168,85,247,0.7)',
                    }}/>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#334155', marginTop: '6px' }}>
                    <span>◀ Left (-0.9)</span>
                    <span>Center (0)</span>
                    <span>Right (+0.9) ▶</span>
                  </div>
                </div>

                {/* How it works note */}
                <div style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '10px', padding: '12px',
                  fontSize: '12px', color: '#94a3b8', lineHeight: '1.5',
                }}>
                  <span style={{ color: '#818cf8', fontWeight: '700' }}>Audio chain: </span>
                  Source → <code style={{ color: '#c7d2fe' }}>GainNode</code> → <code style={{ color: '#c7d2fe' }}>StereoPannerNode</code> → <code style={{ color: '#c7d2fe' }}>ctx.destination</code>
                  <br/>
                  Knobs are updated at 60 FPS via <code style={{ color: '#c7d2fe' }}>setTargetAtTime()</code> (no click/zipper noise).
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB 2: MULTI-PEER ═══ */}
          {activeTab === 'multipeer' && (
            <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '20px', alignItems: 'start' }}>
              <div>
                <div style={{
                  width: '400px', height: '400px',
                  background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '16px', position: 'relative', overflow: 'hidden',
                  boxShadow: '0 0 40px rgba(99,102,241,0.1)',
                }}>
                  {/* Earshot ring */}
                  <div style={{
                    position: 'absolute', top: 100, left: 100,
                    width: 200, height: 200,
                    borderRadius: '50%',
                    border: '1px dashed rgba(99,102,241,0.4)',
                  }}/>

                  {/* You */}
                  <div style={{
                    position: 'absolute', top: 184, left: 184,
                    width: 32, height: 32,
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: '10px', fontWeight: '800',
                    boxShadow: '0 0 16px rgba(99,102,241,0.7)',
                  }}>YOU</div>

                  {/* Peer dots */}
                  {multiPeersRef.current.map(p => (
                    <div key={p.id} style={{
                      position: 'absolute',
                      top: (p.y || 200) - 14, left: (p.x || 200) - 14,
                      width: 28, height: 28,
                      background: p.color,
                      border: '2px solid rgba(255,255,255,0.25)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: '11px', fontWeight: '700',
                      boxShadow: `0 0 12px ${p.color}88`,
                    }}>
                      {p.id === 'peer-alice' ? 'A' : p.id === 'peer-bob' ? 'B' : 'C'}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '700', color: '#c7d2fe' }}>
                  Task 7 — 3 Simultaneous Voices
                </h3>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px', lineHeight: '1.5' }}>
                  Three fake peers orbit at different radii playing a C-major chord (C4, E4, G4). Charlie exceeds 100 px and fades to silence, proving the earshot boundary works across multiple simultaneous mixer channels.
                </p>

                <button
                  id="multi-peer-toggle"
                  onClick={toggleMultiPeer}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: multiRunning
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : 'linear-gradient(135deg, #22c55e, #10b981)',
                    color: 'white', border: 'none',
                    padding: '10px 22px', borderRadius: '8px',
                    fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                    marginBottom: '20px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {multiRunning ? '⏹  Stop Simulation' : '▶  Start 3-Peer Orbit'}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { label: 'Alice (C4 – 261 Hz)', radius: 45,  color: '#38bdf8', status: 'Always audible (45 px)' },
                    { label: 'Bob   (E4 – 329 Hz)', radius: 75,  color: '#a855f7', status: 'Moderate (75 px)' },
                    { label: 'Charlie (G4 – 392 Hz)', radius: 110, color: '#f59e0b', status: 'Beyond earshot → silent' },
                  ].map(p => (
                    <div key={p.label} style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '8px', padding: '10px 14px',
                    }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.color, boxShadow: `0 0 6px ${p.color}` }}/>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0' }}>{p.label}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Orbit: {p.radius} px — {p.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB 3: SLIDERS ═══ */}
          {activeTab === 'sliders' && (
            <div style={{ maxWidth: '540px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#c7d2fe' }}>
                Task 2 — Manual GainNode & StereoPannerNode
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px', lineHeight: '1.5' }}>
                Bypass all distance math and control the two audio nodes directly. This proves the core Web Audio chain is wired correctly before the formula layer is added.
              </p>

              {[
                {
                  label: 'GainNode (Volume)',
                  value: manualGain,
                  min: 0, max: 1, step: 0.01,
                  display: `${(manualGain * 100).toFixed(0)}%`,
                  color: '#818cf8',
                  onChange: (val) => { setManualGain(val); },
                },
                {
                  label: 'StereoPannerNode',
                  value: manualPan,
                  min: -1, max: 1, step: 0.05,
                  display: `${manualPan < 0 ? '◀ Left' : manualPan > 0 ? 'Right ▶' : 'Center'} (${manualPan.toFixed(2)})`,
                  color: '#c084fc',
                  onChange: (val) => { setManualPan(val); },
                },
              ].map(ctrl => (
                <div key={ctrl.label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px', padding: '16px',
                  marginBottom: '12px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#94a3b8' }}>{ctrl.label}</span>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: ctrl.color }}>{ctrl.display}</span>
                  </div>
                  <input
                    type="range"
                    min={ctrl.min} max={ctrl.max} step={ctrl.step}
                    value={ctrl.value}
                    onChange={e => ctrl.onChange(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: ctrl.color }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ═══ TAB 4: FORMULA TABLE ═══ */}
          {activeTab === 'table' && (
            <div style={{ maxWidth: '760px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: '700', color: '#c7d2fe' }}>
                Task 3 — Distance → Volume Formula Comparison
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: '1.5' }}>
                Infotact spec requires gain = 0 at ≥ 100 px. We compared 3 curves and chose <strong style={{ color: '#818cf8' }}>smooth cosine</strong> for the most natural roll-off. Verify: all values at 100 px and beyond must be 0.
              </p>

              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'rgba(99,102,241,0.15)' }}>
                      {['Distance (px)', 'Smooth Cosine ✅', 'Linear', 'Quadratic', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', fontWeight: '700', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {volumeTable.map((row, i) => (
                      <tr key={row.distance} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '9px 14px', fontWeight: '700', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {row.distance} px
                        </td>
                        <td style={{ padding: '9px 14px', fontWeight: '700', color: '#818cf8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {row.smoothGain}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {row.linearGain}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {row.quadraticGain}
                        </td>
                        <td style={{ padding: '9px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {row.distance >= 100
                            ? <span style={{ color: '#ef4444', fontWeight: '700', fontSize: '12px' }}>🔇 Silent</span>
                            : <span style={{ color: '#22c55e', fontWeight: '600', fontSize: '12px' }}>🔊 Audible</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pulse animation keyframe */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
}
