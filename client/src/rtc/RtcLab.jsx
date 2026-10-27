// client/src/rtc/RtcLab.jsx — Person 1
// Test page for Module 1 (open http://localhost:5173/?lab=rtc).
// Task 4: join the office with `net` and show who is online.
// Tasks 7–10: turn on the microphone, connect to nearby people with WebRTC, and play their voices.
// Test: open two tabs (wear headphones), press "Join with mic" in both, and talk.
//
// React StrictMode (main.jsx) mounts, unmounts and mounts this page again once in development.
// So nothing that a cleanup destroys is created at mount time: the microphone, the connection
// to the server and the rtc manager are only created when Join is clicked.

import { useCallback, useEffect, useRef, useState } from 'react';
import { WORLD_MAX_PX } from '@shared/constants.js';
import { EVENTS } from '@shared/events.js';
import { net } from '../net/index.js';
import { getMicStream } from './mic.js';
import { createRtcManager } from './rtcManager.js';

// How far each Move button moves me. 3 clicks = 150 px, beyond DISCONNECT_PX (140), so we disconnect.
const MOVE_STEP_PX = 50;

// What each Move button does to x and y. Remember: y grows DOWN the screen.
const MOVE_STEPS = {
  left: { dx: -MOVE_STEP_PX, dy: 0 },
  right: { dx: MOVE_STEP_PX, dy: 0 },
  up: { dx: 0, dy: -MOVE_STEP_PX },
  down: { dx: 0, dy: MOVE_STEP_PX },
};

// How often the Connections table asks the rtc manager for each connection's state.
// Twice a second is plenty for a test page (connection states change rarely).
const STATE_POLL_MS = 500;

// The event log keeps only the newest lines.
const LOG_LINES = 20;

// A default name like "Tab-042", so two tabs are easy to tell apart.
function makeDefaultName() {
  const threeDigits = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `Tab-${threeDigits}`;
}

// Socket ids are long; the first 6 characters are enough to tell people apart on this page.
function shortId(id) {
  return id.slice(0, 6);
}

// Keep a coordinate inside the map (0 to WORLD_MAX_PX), or the server rejects the move with BAD_MOVE.
function clampToMap(value) {
  return Math.min(Math.max(value, 0), WORLD_MAX_PX);
}

/**
 * One <audio> element playing one remote voice.
 * A MediaStream can't be given as a normal prop like src="..."; it must be put on the element's
 * `srcObject` property. A "ref callback" is a function React calls with the real <audio>
 * element once it is on the page, so we set srcObject there.
 */
function RemoteAudio({ stream }) {
  // useCallback keeps the same function while `stream` stays the same, so React doesn't
  // re-run it on every redraw.
  const attachStream = useCallback(
    (audioElement) => {
      if (audioElement) {
        audioElement.srcObject = stream;
      }
    },
    [stream],
  );
  return <audio ref={attachStream} autoPlay controls />;
}

export function RtcLab() {
  const [name, setName] = useState(makeDefaultName);
  const [status, setStatus] = useState('idle'); // 'idle' | 'joining' | 'joined'
  const [errorText, setErrorText] = useState('');
  const [me, setMe] = useState(null); // { id, name, micLabel } once joined

  // Everyone online, keyed by id: { 'kX9a…': { id, name, x, y, dir } }.
  // Positions arrive 10 times a second; that's fine for a small test list.
  const [players, setPlayers] = useState({});

  // My position, shown on the page. myPosRef holds the same value for the Move buttons.
  // A ref (useRef) is a box that holds a value without making React redraw the page.
  const [myPos, setMyPos] = useState(null);
  const myPosRef = useRef(null);

  // Connections table: [{ id, state }] from rtc.getPeerStates(), and each person's voice stream.
  const [peerStates, setPeerStates] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState({}); // id → MediaStream

  const [muted, setMuted] = useState(false);
  const [logLines, setLogLines] = useState([]);

  // Things created on Join that the cleanup must destroy. Refs, so they never cause a redraw.
  const micRef = useRef(null); // my microphone MediaStream
  const rtcRef = useRef(null); // the rtc manager
  const namesRef = useRef({}); // id → name, so log lines can say "Tab-042" instead of an id
  const lastStatesRef = useRef({}); // id → last connection state we logged

  /** Add one line to the event log, e.g. "14:02:07 sent offer to Tab-042". Keeps the newest 20. */
  function addLog(text) {
    const line = `${new Date().toLocaleTimeString()} ${text}`;
    setLogLines((previous) => [...previous, line].slice(-LOG_LINES));
  }

  /** A readable name for an id: the player's name if we know it, else the short id. */
  function nameOf(id) {
    return namesRef.current[id] || shortId(id);
  }

  // Listen to the server from the moment the page opens. `net` was made with autoConnect: false,
  // so these listeners work even before we join. The cleanup stops them all, so StrictMode's
  // unmount + mount leaves exactly one set of listeners.
  useEffect(() => {
    const stopJoined = net.onPlayerJoined((player) => {
      namesRef.current[player.id] = player.name;
      setPlayers((previous) => ({ ...previous, [player.id]: player }));
    });

    const stopLeft = net.onPlayerLeft(({ id }) => {
      setPlayers((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    });

    // Every 100 ms: everyone's latest x, y, dir. Update the rows we know (they have names).
    const stopState = net.onPlayersState(({ players: latest }) => {
      setPlayers((previous) => {
        const next = { ...previous };
        for (const { id, x, y, dir } of latest) {
          if (next[id]) {
            next[id] = { ...next[id], x, y, dir };
          }
        }
        return next;
      });
    });

    // Log who came close and who walked away. (The rtc manager listens to this too, separately.)
    const stopPeers = net.onPeersUpdate(({ entered, left, changed }) => {
      const parts = [];
      if (entered.length > 0) {
        parts.push(`entered [${entered.map((entry) => nameOf(entry.id)).join(', ')}]`);
      }
      if (left.length > 0) {
        parts.push(`left [${left.map(nameOf).join(', ')}]`);
      }
      if (changed.length > 0) {
        parts.push(`changed [${changed.map((entry) => `${nameOf(entry.id)}: ${entry.mode}`).join(', ')}]`);
      }
      addLog(`${EVENTS.PEERS_UPDATE} ${parts.join(' ')}`);
    });

    // Log every WebRTC note that reaches us, by type (offer, answer, candidate).
    const stopSignal = net.onSignal(({ from, data }) => {
      addLog(`received ${data?.type} from ${nameOf(from)}`);
    });

    return () => {
      stopJoined();
      stopLeft();
      stopState();
      stopPeers();
      stopSignal();
    };
  }, []);

  // When the page really goes away: hang up on everyone and switch the microphone off.
  // During StrictMode's practice unmount nothing has been created yet, so this does nothing.
  useEffect(() => {
    return () => {
      if (rtcRef.current) {
        rtcRef.current.closeAll();
        rtcRef.current = null;
      }
      stopMicrophone(micRef);
    };
  }, []);

  // While joined, check each connection's state twice a second: update the table and log changes.
  useEffect(() => {
    if (status !== 'joined') {
      return undefined;
    }

    const timer = setInterval(() => {
      const rtc = rtcRef.current;
      if (!rtc) {
        return;
      }
      const states = rtc.getPeerStates();
      const last = lastStatesRef.current;
      const next = {};
      let somethingChanged = Object.keys(last).length !== states.length;

      for (const { id, state } of states) {
        next[id] = state;
        if (last[id] !== state) {
          addLog(`connection ${nameOf(id)}: ${state}`);
          somethingChanged = true;
        }
      }

      lastStatesRef.current = next;
      // Only redraw when something changed, not every 500 ms.
      if (somethingChanged) {
        setPeerStates(states);
      }
    }, STATE_POLL_MS);

    return () => clearInterval(timer);
  }, [status]);

  async function handleJoin() {
    setStatus('joining');
    setErrorText('');

    // 1. Microphone first. If it fails we don't join at all, and the message says why.
    let micStream;
    try {
      micStream = await getMicStream();
    } catch (error) {
      setErrorText(error.message);
      setStatus('idle');
      return;
    }
    micRef.current = micStream;
    const micLabel = micStream.getAudioTracks()[0]?.label || 'microphone';
    addLog(`microphone on: ${micLabel}`);

    // 2. Join the office.
    let init;
    try {
      init = await net.connect({ name });
    } catch (error) {
      stopMicrophone(micRef);
      setErrorText(error.message);
      setStatus('idle');
      return;
    }

    // 3. Create the rtc manager IMMEDIATELY, with no other `await` before it.
    //    Why: the first peers:update (and maybe an offer) can arrive soon after joining.
    //    The manager must already be listening, or that message is missed and we never connect.
    //
    //    loggingNet is `net` with one change: sendSignal also writes a log line, so the page
    //    can show every note we send. Everything else is the real net, untouched.
    const loggingNet = {
      ...net,
      sendSignal(signal) {
        addLog(`sent ${signal.data.type} to ${nameOf(signal.to)}`);
        net.sendSignal(signal);
      },
    };
    rtcRef.current = createRtcManager({
      net: loggingNet,
      selfId: init.selfId,
      micStream,
      onRemoteStream: (id, stream) => {
        addLog(`audio arrived from ${nameOf(id)}`);
        setRemoteStreams((previous) => ({ ...previous, [id]: stream }));
      },
      onPeerClosed: (id) => {
        addLog(`connection to ${nameOf(id)} closed`);
        setRemoteStreams((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
      },
      onPeerMode: (id, mode) => {
        addLog(`mode for ${nameOf(id)}: ${mode}`);
      },
    });

    // 4. Fill the page: the people already here, plus me.
    const { selfId, spawn, players: alreadyHere } = init;
    namesRef.current[selfId] = name;
    for (const player of alreadyHere) {
      namesRef.current[player.id] = player.name;
    }
    setPlayers((previous) => {
      const next = { ...previous, [selfId]: { id: selfId, name, x: spawn.x, y: spawn.y, dir: 'down' } };
      for (const player of alreadyHere) {
        next[player.id] = player;
      }
      return next;
    });

    setMe({ id: selfId, name, micLabel });
    myPosRef.current = { x: spawn.x, y: spawn.y };
    setMyPos(myPosRef.current);
    setStatus('joined');
  }

  // Move 50 px in one direction and tell the server. The other tab sees it within 100 ms,
  // and the proximity tick (250 ms) decides whether we connect or disconnect.
  function handleMove(direction) {
    const { dx, dy } = MOVE_STEPS[direction];
    const current = myPosRef.current;
    const next = { x: clampToMap(current.x + dx), y: clampToMap(current.y + dy) };
    myPosRef.current = next;
    setMyPos(next);
    net.sendMove({ x: next.x, y: next.y, dir: direction });
  }

  function handleToggleMute() {
    const nextMuted = !muted;
    rtcRef.current?.setMuted(nextMuted);
    setMuted(nextMuted);
    addLog(nextMuted ? 'muted' : 'unmuted');
  }

  return (
    <section>
      <h2>Module 1 lab — microphone and voice connections</h2>

      <p>
        Open this page in two tabs and wear headphones. Both join. You start in the same spot, so you connect at once.
        Move one tab 150 px away to disconnect.
      </p>

      <p>
        <label>
          Name: <input value={name} onChange={(event) => setName(event.target.value)} disabled={status !== 'idle'} />
        </label>{' '}
        <button onClick={handleJoin} disabled={status !== 'idle'}>
          {status === 'joining' ? 'Joining…' : 'Join with mic'}
        </button>
      </p>

      {errorText && <p style={{ color: 'crimson' }}>Error: {errorText}</p>}

      {me && myPos && (
        <>
          <p>
            Me: <strong>{me.name}</strong> (id <code>{shortId(me.id)}</code>) — at x {myPos.x}, y {myPos.y} — microphone:{' '}
            <strong>{muted ? 'muted' : 'live'}</strong> ({me.micLabel}){' '}
            <button onClick={handleToggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
          </p>

          <p>
            Move {MOVE_STEP_PX} px:{' '}
            {Object.keys(MOVE_STEPS).map((direction) => (
              <button key={direction} onClick={() => handleMove(direction)} style={{ marginRight: 4 }}>
                {direction}
              </button>
            ))}
          </p>

          <h3>Online ({Object.keys(players).length})</h3>
          <ul>
            {Object.values(players).map((player) => (
              <li key={player.id}>
                {player.name} — id <code>{shortId(player.id)}</code> — x {player.x}, y {player.y} —{' '}
                {player.id === me.id
                  ? 'me'
                  : `${Math.round(Math.hypot(player.x - myPos.x, player.y - myPos.y))} px from me`}
              </li>
            ))}
          </ul>

          <h3>Connections ({peerStates.length})</h3>
          {peerStates.length === 0 ? (
            <p>No voice connections. Stand within 100 px of someone.</p>
          ) : (
            <table cellPadding={4} style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">Name</th>
                  <th align="left">Id</th>
                  <th align="left">State</th>
                  <th align="left">Voice</th>
                </tr>
              </thead>
              <tbody>
                {peerStates.map(({ id, state }) => (
                  <tr key={id}>
                    <td>{nameOf(id)}</td>
                    <td>
                      <code>{shortId(id)}</code>
                    </td>
                    <td>{state}</td>
                    <td>{remoteStreams[id] ? <RemoteAudio stream={remoteStreams[id]} /> : 'waiting for audio…'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <h3>Event log (newest last)</h3>
      <pre style={{ background: '#f4f4f4', padding: 8, minHeight: 80 }}>{logLines.join('\n')}</pre>
    </section>
  );
}

/** Switch the microphone off (the browser's red "recording" dot goes away) and empty the ref. */
function stopMicrophone(micRef) {
  if (!micRef.current) {
    return;
  }
  for (const track of micRef.current.getTracks()) {
    track.stop();
  }
  micRef.current = null;
}
