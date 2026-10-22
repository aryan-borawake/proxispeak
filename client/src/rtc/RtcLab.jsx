// client/src/rtc/RtcLab.jsx — Person 1
// Test page for Module 1 (open http://localhost:5173/?lab=rtc).
// Task 4: join the office with `net` and show who is online.
// Test: open two tabs, join in both, and each tab lists the other.
// Later tasks add the microphone (Task 7) and voice connections (Tasks 8–10).

import { useEffect, useRef, useState } from 'react';
import { WORLD_MAX_PX } from '@shared/constants.js';
import { net } from '../net/index.js';

// How far the "Move right" button moves me each click.
const MOVE_STEP_PX = 10;

// A default name like "Tab-042", so two tabs are easy to tell apart.
function makeDefaultName() {
  const threeDigits = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `Tab-${threeDigits}`;
}

export function RtcLab() {
  const [name, setName] = useState(makeDefaultName);
  const [status, setStatus] = useState('idle'); // 'idle' | 'joining' | 'joined'
  const [errorText, setErrorText] = useState('');
  const [me, setMe] = useState(null); // { id, name } once joined

  // Everyone online, as an object keyed by id: { 'kX9a…': { id, name, x, y, dir } }.
  // Keyed by id so join, leave and position updates are each one quick lookup.
  // Positions arrive 10 times a second; that's fine for a small test list.
  const [players, setPlayers] = useState({});

  // My own position, used by the Move button. A ref (useRef) is a box that holds
  // a value without making React redraw the page when it changes.
  const myPosRef = useRef(null);

  // Start listening when the page opens. `net` was made with autoConnect: false,
  // so these listeners work even though we haven't joined yet.
  useEffect(() => {
    // Someone new arrived: add a row.
    const stopJoined = net.onPlayerJoined((player) => {
      setPlayers((prev) => ({ ...prev, [player.id]: player }));
    });

    // Someone left: remove their row.
    const stopLeft = net.onPlayerLeft(({ id }) => {
      setPlayers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    // Every 100 ms: everyone's latest x, y, dir. Update the rows we know (they have names).
    const stopState = net.onPlayersState(({ players: latest }) => {
      setPlayers((prev) => {
        const next = { ...prev };
        for (const { id, x, y, dir } of latest) {
          if (next[id]) {
            next[id] = { ...next[id], x, y, dir };
          }
        }
        return next;
      });
    });

    // Cleanup: when the page closes, stop all three listeners so nothing leaks.
    return () => {
      stopJoined();
      stopLeft();
      stopState();
    };
  }, []);

  async function handleJoin() {
    setStatus('joining');
    setErrorText('');
    try {
      const { selfId, spawn, players: alreadyHere } = await net.connect({ name });

      // Start the list with the people already here, plus me.
      const mine = { id: selfId, name, x: spawn.x, y: spawn.y, dir: 'down' };
      setPlayers((prev) => {
        const next = { ...prev, [selfId]: mine };
        for (const player of alreadyHere) {
          next[player.id] = player;
        }
        return next;
      });

      setMe({ id: selfId, name });
      myPosRef.current = { x: spawn.x, y: spawn.y };
      setStatus('joined');
    } catch (error) {
      setErrorText(error.message);
      setStatus('idle');
    }
  }

  // Move 10 px to the right and tell the server. The other tab sees it within 100 ms.
  function handleMoveRight() {
    const { x, y } = myPosRef.current;
    // Never go past the map's right edge; the server would reject it with BAD_MOVE.
    const newX = Math.min(x + MOVE_STEP_PX, WORLD_MAX_PX);
    myPosRef.current = { x: newX, y };
    net.sendMove({ x: newX, y, dir: 'right' });
  }

  return (
    <section>
      <h2>Module 1 lab — who is online</h2>

      <p>
        <label>
          Name: <input value={name} onChange={(event) => setName(event.target.value)} disabled={status !== 'idle'} />
        </label>{' '}
        <button onClick={handleJoin} disabled={status !== 'idle'}>
          {status === 'joining' ? 'Joining…' : 'Join'}
        </button>
      </p>

      {errorText && <p style={{ color: 'crimson' }}>Error: {errorText}</p>}

      {me && (
        <>
          <p>
            Me: <strong>{me.name}</strong> (id <code>{me.id}</code>)
          </p>
          <p>
            <button onClick={handleMoveRight}>Move right {MOVE_STEP_PX} px</button>
          </p>

          <h3>Online ({Object.keys(players).length})</h3>
          <ul>
            {Object.values(players).map((player) => (
              <li key={player.id}>
                {player.name}
                {player.id === me.id ? ' (me)' : ''} — id <code>{player.id.slice(0, 6)}</code> — x {player.x}, y{' '}
                {player.y}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
