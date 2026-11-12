// client/src/OfficeLab.jsx — Person 1
// The whole app on one test page (open http://localhost:5173/?lab=office).
// All four modules, wired exactly as CONTRACTS.md section 8 says:
//
//   net (Person 1) ──► WORLD_INIT ──► WorldCanvas (Person 3) ──onFrame──► mixer.update (Person 4)
//   getMicStream + rtc manager (Person 1) ──onRemoteStream / onPeerClosed / onPeerMode──► mixer
//   AudioControls (Person 4) ──onToggleMute──► rtc.setMuted (Person 1)
//
// Remote voices play ONLY through the mixer (Web Audio). This page adds no <audio> elements of
// its own: a normal <audio> element would play the voice at full volume whatever the distance,
// and the distance volume would not work.
//
// React StrictMode (main.jsx) mounts, unmounts and mounts this page again once in development.
// So the microphone, the mixer and the rtc manager are created ONLY when "Join the office" is
// clicked, never at mount time (and nothing is made in useMemo that a cleanup destroys).

// v5: the mixer / microphone / rtc manager wiring now lives in app/useVoiceSession.js, shared with
// the product's office page, so both pages use exactly the same code.

import { useEffect, useRef, useState } from 'react';
import { net } from './net/index.js';
import { WorldCanvas } from './world/index.js';
import { AudioControls } from './audio/index.js';
import { useVoiceSession } from './app/useVoiceSession.js';

// How often the side panel is refreshed. Twice a second is enough for people to read it.
// (Not every frame: React redrawing the page 60 times a second would slow the game down.)
const PANEL_REFRESH_MS = 500;

// The way my avatar faces after a re-join. WorldCanvas also starts every avatar facing down.
const REJOIN_DIR = 'down';

// Keys the world uses for walking. Normally they would also scroll the page up and down.
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const HELP_TEXT =
  'Open this page in TWO WINDOWS side by side (not two tabs: a hidden tab pauses its animation). ' +
  'Wear headphones. Join in both. Walk with the arrow keys in the focused window: voices fade in ' +
  'under 100 px and out as you walk apart.';

// A default name like "Guest-042", so two windows are easy to tell apart.
function makeDefaultName() {
  const threeDigits = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `Guest-${threeDigits}`;
}

// Socket ids are long; the first 6 characters are enough to tell people apart on screen.
function shortId(id) {
  return id.slice(0, 6);
}

// Is the user typing in a text box? Then arrow keys must work normally (move the text cursor).
function isTextField(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && element.type === 'text';
}

/**
 * Turn a pan value (-1 = fully left, 0 = middle, +1 = fully right) into words.
 * Example: -0.42 → "0.42 left", 0.10 → "0.10 right", 0 → "centre".
 */
function describePan(pan) {
  if (Math.abs(pan) < 0.005) return 'centre';
  const side = pan < 0 ? 'left' : 'right';
  return `${Math.abs(pan).toFixed(2)} ${side}`;
}

export function OfficeLab() {
  // --- React state: only things that change rarely and should redraw the page ---
  const [name, setName] = useState(makeDefaultName);
  const [status, setStatus] = useState('idle'); // 'idle' → 'joining' → 'joined'
  const [errorText, setErrorText] = useState('');
  const [joinInfo, setJoinInfo] = useState(null); // { selfId, spawn, players } from EVENTS.WORLD_INIT
  const [micStream, setMicStream] = useState(null); // given to AudioControls for its level meter
  const [muted, setMuted] = useState(false);
  const [debug, setDebug] = useState(true); // earshot circle + FPS counter, on by default
  const [panel, setPanel] = useState(null); // what the side panel shows (refreshed twice a second)

  // --- The voice wiring (mixer, microphone, rtc manager, onFrame), shared with the office page ---
  const voice = useVoiceSession();
  const { mixerRef, rtcRef, micRef, frameRef, onFrame } = voice;

  // --- Refs: boxes that hold a value WITHOUT redrawing the page when it changes ---
  const namesRef = useRef({}); // id → name, so the panel can show names instead of ids
  const myNameRef = useRef(''); // the name I joined with (the re-join listener reads it)

  // Keep track of everyone's names. These listeners are set up at mount and removed in the
  // cleanup, so StrictMode's mount → unmount → mount leaves exactly one set listening.
  useEffect(() => {
    const stopJoined = net.onPlayerJoined((player) => {
      namesRef.current[player.id] = player.name;
    });
    const stopLeft = net.onPlayerLeft(({ id }) => {
      delete namesRef.current[id];
    });
    return () => {
      stopJoined();
      stopLeft();
    };
  }, []);

  // Re-join after a server restart or a network blip (net joins again by itself, Task 11).
  // We get a NEW selfId, and every old id (mine and everyone else's) is dead. So:
  //   1. closeAll() the old rtc manager. Its onPeerClosed takes each old voice out of the mixer.
  //   2. Make a new rtc manager with the new selfId, the same microphone and the same mixer,
  //      straight away, before the first peers:update for the new id can arrive.
  //   3. Stay where I was: the server put me back at the spawn point, so send my last position
  //      (from the latest frame) once with net.sendMove.
  //   4. Give WorldCanvas the new id. It only reads selfId and spawn when it first starts, so
  //      we remount it with key={selfId} (a new key makes React throw the old one away and build
  //      a fresh one). Without that, the world would draw my new id as "someone else".
  // Example: I was 'a1' at (412, 300). The server restarts; I come back as 'c3'. The new world
  //          starts at (412, 300) and the server hears "c3 is at (412, 300)".
  useEffect(() => {
    const stopRejoin = net.onRejoin(({ selfId, spawn, players }) => {
      // We never joined on this page: nothing to rebuild.
      if (!rtcRef.current || !mixerRef.current || !micRef.current) {
        return;
      }
      console.log(`[office] re-joined as ${selfId}; rebuilding voice connections and the world`);

      voice.startRtc(selfId); // closes the old manager first

      // Where I was in the last frame, or the server's spawn if the world never drew a frame.
      const lastSelf = frameRef.current?.self;
      const position = lastSelf ? { x: lastSelf.x, y: lastSelf.y } : { x: spawn.x, y: spawn.y };
      net.sendMove({ x: position.x, y: position.y, dir: REJOIN_DIR });

      // The old frame has old ids in it; the remounted world sends a fresh one.
      frameRef.current = null;
      namesRef.current[selfId] = myNameRef.current;
      for (const player of players) {
        namesRef.current[player.id] = player.name;
      }
      setJoinInfo({ selfId, spawn: position, players });
    });
    return stopRejoin;
  }, []);

  // onFrame (from useVoiceSession): WorldCanvas calls it every animation frame with
  // { self: { id, x, y }, others: [{ id, x, y, blocked }] }; it remembers the frame for the side
  // panel and updates the mixer. When the page goes away, useVoiceSession hangs up on everyone,
  // turns the microphone off and takes every voice out of the mixer.

  // While joined, stop the arrow keys from scrolling the page, so walking doesn't make the
  // page jump around. (WorldCanvas still gets the key: preventDefault only cancels the scroll.)
  useEffect(() => {
    if (status !== 'joined') return undefined;
    function stopArrowScroll(event) {
      if (ARROW_KEYS.has(event.key) && !isTextField(event.target)) {
        event.preventDefault();
      }
    }
    window.addEventListener('keydown', stopArrowScroll);
    return () => window.removeEventListener('keydown', stopArrowScroll);
  }, [status]);

  // While joined, refresh the side panel twice a second (not every frame).
  useEffect(() => {
    if (status !== 'joined') return undefined;
    const timer = setInterval(() => {
      setPanel(buildPanel(frameRef.current, rtcRef.current, mixerRef.current, namesRef.current));
    }, PANEL_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status]);

  async function handleJoin() {
    setStatus('joining');
    setErrorText('');

    // 1–2. The mixer (resumed: this click is our permission to play sound) and the microphone.
    //      If either fails we stop here, and the message says what to do.
    let stream;
    try {
      stream = await voice.startAudio();
    } catch (error) {
      setErrorText(error.message);
      setStatus('idle');
      return;
    }

    // 3. Join the office through the server.
    let result;
    try {
      result = await net.connect({ name: name.trim() });
    } catch (error) {
      // e.g. "[net] could not connect to http://localhost:3001 … Is the server running?"
      voice.stopAll();
      setErrorText(error.message);
      setStatus('idle');
      return;
    }

    // 4. The rtc manager, IMMEDIATELY (no other `await` before it). The first EVENTS.PEERS_UPDATE,
    //    and maybe an offer, can arrive very soon after joining; the manager must already be
    //    listening, or we miss it and never connect to that person.
    voice.startRtc(result.selfId);

    // 5. Remember everyone already in the room, then show the world.
    for (const player of result.players) {
      namesRef.current[player.id] = player.name;
    }
    myNameRef.current = name.trim();
    namesRef.current[result.selfId] = name.trim();
    setJoinInfo({ selfId: result.selfId, spawn: result.spawn, players: result.players });
    setMicStream(stream);
    setStatus('joined');
  }

  // Mute: turn my microphone track off (nobody hears me) and update the button.
  function handleToggleMute() {
    const nextMuted = !muted;
    voice.setMuted(nextMuted);
    setMuted(nextMuted);
  }

  return (
    <section>
      <h2>Office (all modules)</h2>
      <p style={{ maxWidth: 760 }}>{HELP_TEXT}</p>

      {status !== 'joined' && (
        <p>
          <label>
            Your name:{' '}
            <input value={name} onChange={(event) => setName(event.target.value)} disabled={status === 'joining'} />
          </label>{' '}
          <button onClick={handleJoin} disabled={status === 'joining' || name.trim() === ''}>
            {status === 'joining' ? 'Joining…' : 'Join the office'}
          </button>
        </p>
      )}

      {errorText !== '' && <p style={{ color: '#b91c1c', fontWeight: 600 }}>Error: {errorText}</p>}

      {status === 'joined' && joinInfo !== null && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <AudioControls micStream={micStream} muted={muted} onToggleMute={handleToggleMute} />
            <label>
              <input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} /> Debug
              (earshot circle + FPS)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* minWidth 0 lets the canvas shrink in a narrow window instead of overflowing. */}
            <div style={{ flex: '1 1 600px', minWidth: 0 }}>
              {/* key={selfId}: after a re-join (new id) React builds a fresh WorldCanvas. */}
              <WorldCanvas
                key={joinInfo.selfId}
                net={net}
                selfId={joinInfo.selfId}
                spawn={joinInfo.spawn}
                initialPlayers={joinInfo.players}
                onFrame={onFrame}
                debug={debug}
              />
            </div>
            <SidePanel panel={panel} myName={name.trim()} />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Collect what the side panel shows, from the latest frame, the rtc manager and the mixer.
 * Called twice a second. Returns plain data, e.g.
 * { me: { x: 212, y: 200 }, voices: [{ id, name, state: 'connected', distance: 64, gain: 0.36, pan: 0.42 }] }
 */
function buildPanel(frame, rtc, mixer, names) {
  const me = frame ? { x: Math.round(frame.self.x), y: Math.round(frame.self.y) } : null;

  // The mixer's view of each voice: current volume (gain 0..1) and left/right (pan -1..1).
  const audioById = {};
  if (mixer) {
    for (const diagnostic of mixer.getPeerDiagnostics()) {
      audioById[diagnostic.id] = diagnostic;
    }
  }

  // Where each other person is, from the same frame the mixer used.
  const positionById = {};
  if (frame) {
    for (const other of frame.others) {
      positionById[other.id] = other;
    }
  }

  // One row per voice connection the rtc manager has (state: 'new', 'connecting', 'connected'…).
  const voices = (rtc ? rtc.getPeerStates() : []).map(({ id, state }) => {
    const audio = audioById[id];
    const position = positionById[id];
    const distance = frame && position ? Math.round(Math.hypot(position.x - frame.self.x, position.y - frame.self.y)) : null;
    return {
      id,
      name: names[id] || shortId(id),
      state,
      distance,
      gain: audio ? audio.gain : null, // null = no voice in the mixer yet
      pan: audio ? audio.pan : null,
    };
  });

  return { me, voices };
}

/** The panel on the right: me, then one card per voice connection with volume and pan bars. */
function SidePanel({ panel, myName }) {
  return (
    <aside style={{ flex: '0 1 300px', minWidth: 240, fontSize: 14 }}>
      <h3 style={{ marginTop: 0 }}>Me</h3>
      <p>
        {myName}
        {panel?.me ? ` at x ${panel.me.x}, y ${panel.me.y}` : ''}
      </p>

      <h3>Voice connections</h3>
      {(!panel || panel.voices.length === 0) && <p>Nobody in earshot. Walk within 100 px of someone.</p>}
      {panel?.voices.map((voice) => (
        <div key={voice.id} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, marginBottom: 8 }}>
          <div>
            <b>{voice.name}</b> — {voice.state}
            {voice.distance !== null ? `, ${voice.distance} px away` : ''}
          </div>
          {voice.gain === null ? (
            <div style={{ color: '#64748b' }}>no voice in the mixer yet</div>
          ) : (
            <>
              <div>Volume {Math.round(voice.gain * 100)}%</div>
              <VolumeBar gain={voice.gain} />
              <div>Left/right: {describePan(voice.pan)}</div>
              <PanBar pan={voice.pan} />
            </>
          )}
        </div>
      ))}
    </aside>
  );
}

/** A bar that fills from the left: empty at volume 0, full at volume 1. */
function VolumeBar({ gain }) {
  return (
    <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', margin: '2px 0 6px' }}>
      <div style={{ width: `${Math.round(gain * 100)}%`, height: '100%', background: '#22c55e' }} />
    </div>
  );
}

/**
 * A track with a dot: the dot is at the left end for pan -1, in the middle for 0,
 * and at the right end for +1. Example: pan 0.5 → the dot is 75% of the way across.
 */
function PanBar({ pan }) {
  const percentAcross = ((pan + 1) / 2) * 100;
  return (
    <div style={{ position: 'relative', height: 8, background: '#e2e8f0', borderRadius: 4, margin: '2px 0' }}>
      {/* the middle line */}
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#94a3b8' }} />
      <div
        style={{
          position: 'absolute',
          left: `calc(${percentAcross}% - 5px)`,
          top: -1,
          width: 10,
          height: 10,
          borderRadius: 5,
          background: '#6366f1',
        }}
      />
    </div>
  );
}
