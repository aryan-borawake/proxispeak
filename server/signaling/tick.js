// server/signaling/tick.js — Person 1 (Module 1: Signaling + WebRTC)
// The proximity tick: 4 times a second (every PROXIMITY_TICK_MS = 250 ms) the server asks
// "who is near whom?" and tells each browser who came close (entered) or walked away (left).
// The steps follow CONTRACTS.md section 6, "The proximity tick".
//
// Why a timer and not on every move? Moves arrive up to 10 times a second per person.
// "Who is near" changes slowly, so checking 4 times a second is enough, and later
// (Task 9) each check costs a MongoDB query, so we want as few as possible.
//
// Peer sets: for every player we keep a Set of the ids they are connected to.
// A Set is like an array that can't hold the same value twice.
// Example: peerSets.get('riya') → Set { 'sam', 'lee' }
// Peers are SYMMETRIC: if Sam is in Riya's set, Riya is in Sam's set.

import { EVENTS } from '../../shared/events.js';
import { AUDIO_MODES, DISCONNECT_PX, EARSHOT_PX, PROXIMITY_TICK_MS } from '../../shared/constants.js';
import { getPlayer, listPlayers } from './players.js';
// "Who is near" has two possible sources (Task 9):
//   - Person 2's geo engine (MongoDB), when server/index.js could start it (geo is an object);
//   - our fake, fakeNearby.js (in-memory Math.hypot), when it couldn't (geo is null).
// computePeerChanges always comes from fakeNearby.js, for both sources. It is a pure function
// (no database), so it doesn't matter where the distances came from. Person 2's identical,
// tested version lives in server/geo/peerChanges.js on `dev`; we keep our own copy here so
// this branch works on its own.
import { findNearby as fakeFindNearby, computePeerChanges } from './fakeNearby.js';

// id → Set of peer ids. Only this file changes it.
const peerSets = new Map();

/**
 * Get this player's peer set, creating an empty one the first time ("lazily").
 * This way a new player needs no setup step: their set appears when the tick first needs it.
 */
function getPeerSet(playerId) {
  let peerSet = peerSets.get(playerId);
  if (!peerSet) {
    peerSet = new Set();
    peerSets.set(playerId, peerSet);
  }
  return peerSet;
}

/**
 * Are these two players peers right now (is b in a's peer set)?
 * The SIGNAL handler (index.js) uses this to pass WebRTC notes only between people in earshot.
 * Peer sets are symmetric, so arePeers(a, b) and arePeers(b, a) always give the same answer.
 *
 * Example: Riya's set is { 'sam' } → arePeers('riya', 'sam') is true, arePeers('riya', 'lee') is false.
 *
 * @param {string} a - one player's id
 * @param {string} b - the other player's id
 * @returns {boolean}
 */
export function arePeers(a, b) {
  const peerSet = peerSets.get(a);
  // `?.` : if a has no peer set yet, the answer is undefined, and `=== true` turns that into false.
  return peerSet?.has(b) === true;
}

/**
 * Start the proximity tick. Call this ONCE, from attachSignaling.
 * @param {import('socket.io').Server} io - the Socket.io server
 * @param {object | null} geo - Person 2's engine, or null to use the fake (fakeNearby.js)
 * @returns {void}
 */
export function startProximityTick(io, geo) {
  // findNearby is async. With MongoDB (Task 9) one tick might take longer than 250 ms.
  // This flag stops a second tick starting while the first is still waiting,
  // so two ticks never change the same peer sets at the same time.
  let tickIsRunning = false;

  const timer = setInterval(async () => {
    if (tickIsRunning) {
      return;
    }
    tickIsRunning = true;

    try {
      await runProximityTick(io, geo);
    } catch (error) {
      // Never let one bad tick crash the server. Log it, skip the rest of this tick;
      // the next tick tries again. A geo (MongoDB) error inside the tick also lands here.
      console.error('[tick] the proximity tick failed, skipped; will try again next tick:', error);
    } finally {
      // `finally` runs whether the tick worked or threw.
      tickIsRunning = false;
    }
  }, PROXIMITY_TICK_MS);

  // unref(): this timer alone is not a reason for Node to keep running (same as the broadcast).
  timer.unref();
}

/**
 * One proximity tick. The numbered steps match CONTRACTS.md section 6.
 *
 * Example: Riya stands at (200, 200); Sam walks to (290, 200), 90 px away.
 *   findNearby(Sam, 140) → [{ id: Riya, distance: 90 }]
 *   computePeerChanges(Sam's empty set, ...) → { entered: [Riya], left: [] }  (90 <= 100)
 *   → Sam's set gets Riya, Riya's set gets Sam, and BOTH browsers get peers:update.
 */
async function runProximityTick(io, geo) {
  // 1. Collect the players who are new or moved since the last tick. Nobody moved → nothing to do.
  const movedPlayers = listPlayers().filter((player) => player.moved === true);
  if (movedPlayers.length === 0) {
    return;
  }

  // 7. (done early on purpose) Clear the "moved" flags NOW, before any waiting.
  //    If a player moves again while we wait for findNearby, their flag becomes true again
  //    and the next tick picks that move up. If we cleared at the end, that move would be lost.
  //    Clearing first also means a crash later in this tick can't leave flags stuck on.
  for (const player of movedPlayers) {
    player.moved = false;
  }

  // 2. Save the moved players' positions in MongoDB, in ONE call (Person 2 does one bulkWrite).
  //    Only with the real engine: the fake reads the in-memory Map directly, so it needs no saving.
  //    We send only { id, x, y } (not name, dir or the `moved` flag).
  if (geo) {
    const positions = movedPlayers.map((player) => ({ id: player.id, x: player.x, y: player.y }));
    try {
      await geo.upsertPositions(positions);
    } catch (error) {
      // MongoDB failed (e.g. it went down). We can't trust "who is near" without fresh positions,
      // so we skip this tick. We set the flags back on first, so these players are checked again
      // next tick instead of being forgotten until they move. `throw` sends the error to the
      // try/catch in startProximityTick, which logs it.
      for (const player of movedPlayers) {
        player.moved = true;
      }
      throw error;
    }
  }

  // 3. Ask "who is near?" for every moved player IN PARALLEL. Promise.all starts all the
  //    questions at once and waits until every answer is back. With MongoDB this is much
  //    faster than asking one, waiting, asking the next...
  //    One failed question must not lose everyone's answer, so a failure becomes null.
  const nearbyLists = await Promise.all(
    movedPlayers.map((player) =>
      askWhoIsNear(geo, player.id).catch((error) => {
        console.error(`[tick] findNearby failed for ${player.id}:`, error);
        return null;
      }),
    ),
  );

  // Who needs a peers:update at the end, and what goes in it.
  // id → { entered: [ids], left: [ids] }
  const changesByPlayer = new Map();

  // 4–5. Process the answers ONE AFTER ANOTHER (a plain for loop, no more waiting).
  //      Each step updates the peer sets before the next player is checked, so the
  //      next computePeerChanges already sees the new sets. That is what stops duplicates:
  //      if Riya and Sam both moved, Riya's step connects the pair, and Sam's step then
  //      finds Riya already in his set, so she is not "entered" a second time.
  //      nearbyLists[i] is the answer for movedPlayers[i] (Promise.all keeps the order).
  for (let i = 0; i < movedPlayers.length; i += 1) {
    const player = movedPlayers[i];
    const nearby = nearbyLists[i];

    if (nearby === null) {
      continue; // findNearby failed for this player (already logged); try again next time they move
    }

    // The player may have disconnected while we were waiting. Skip them.
    if (!getPlayer(player.id)) {
      continue;
    }

    try {

      const { entered, left } = computePeerChanges(getPeerSet(player.id), nearby, {
        connectPx: EARSHOT_PX,
        disconnectPx: DISCONNECT_PX,
      });

      for (const otherId of entered) {
        connectPair(player.id, otherId, changesByPlayer);
      }
      for (const otherId of left) {
        disconnectPair(player.id, otherId, changesByPlayer);
      }
    } catch (error) {
      // One player's problem must not stop the others from being processed.
      console.error(`[tick] could not update peers for ${player.id}:`, error);
    }
  }

  // 6. Send each affected browser ONE peers:update with everything that changed for it.
  sendPeerUpdates(io, changesByPlayer);
}

/**
 * "Who is within DISCONNECT_PX of this player?" from whichever source we have.
 * Both answer in the same format: [{ id, distance }], closest first, never the player themselves.
 *
 * It is `async` on purpose: if the engine throws straight away instead of returning a failed
 * Promise, `async` still turns that into a failed Promise, so the `.catch` in the tick handles both.
 *
 * @param {object | null} geo - Person 2's engine, or null for the fake
 * @param {string} playerId
 * @returns {Promise<Array<{ id: string, distance: number }>>}
 */
async function askWhoIsNear(geo, playerId) {
  if (geo) {
    return geo.findNearby(playerId, DISCONNECT_PX);
  }
  return fakeFindNearby(playerId, DISCONNECT_PX);
}

/**
 * Connect two players: add each to the other's peer set, and note "entered" for both.
 * Does nothing if they are already connected, or if either one has left the server.
 */
function connectPair(playerId, otherId, changesByPlayer) {
  if (!getPlayer(playerId) || !getPlayer(otherId)) {
    return;
  }
  const playerPeers = getPeerSet(playerId);
  if (playerPeers.has(otherId)) {
    return; // already connected: recording it again would be a duplicate
  }

  playerPeers.add(otherId);
  getPeerSet(otherId).add(playerId);

  getChanges(changesByPlayer, playerId).entered.push(otherId);
  getChanges(changesByPlayer, otherId).entered.push(playerId);

  console.log(`[tick] entered: ${describe(playerId)} <-> ${describe(otherId)}`);
}

/**
 * Disconnect two players: remove each from the other's peer set, and note "left" for both.
 * Does nothing if they are not connected (so "left" is never recorded twice).
 */
function disconnectPair(playerId, otherId, changesByPlayer) {
  const playerPeers = getPeerSet(playerId);
  if (!playerPeers.has(otherId)) {
    return;
  }

  playerPeers.delete(otherId);
  getPeerSet(otherId).delete(playerId);

  getChanges(changesByPlayer, playerId).left.push(otherId);
  getChanges(changesByPlayer, otherId).left.push(playerId);

  console.log(`[tick] left: ${describe(playerId)} <-> ${describe(otherId)}`);
}

/** Get (or create) the { entered, left } lists for one player in this tick. */
function getChanges(changesByPlayer, playerId) {
  let changes = changesByPlayer.get(playerId);
  if (!changes) {
    changes = { entered: [], left: [] };
    changesByPlayer.set(playerId, changes);
  }
  return changes;
}

/**
 * Emit EVENTS.PEERS_UPDATE to every player whose peers changed in this tick.
 * Payload: { entered: [{ id, mode }], left: [id], changed: [] }
 * In Weeks 1–2 mode is always AUDIO_MODES.FALLOFF and `changed` is always empty.
 *
 * `io.to(id)` works because Socket.io automatically puts every socket in a private
 * room named after its own id, so this reaches exactly that one browser.
 */
function sendPeerUpdates(io, changesByPlayer) {
  for (const [playerId, changes] of changesByPlayer) {
    // Nothing to say → send nothing.
    if (changes.entered.length === 0 && changes.left.length === 0) {
      continue;
    }

    io.to(playerId).emit(EVENTS.PEERS_UPDATE, {
      entered: changes.entered.map((peerId) => ({ id: peerId, mode: AUDIO_MODES.FALLOFF })),
      left: changes.left,
      changed: [],
    });
  }
}

/**
 * A player disconnected: take them out of every peer set, and tell each former peer
 * with a peers:update { entered: [], left: [thatId], changed: [] }.
 * Call this from the disconnect handler (index.js).
 *
 * Why not wait for the next tick? The tick only checks players who moved. A peer who
 * stands still would never be checked, so they would stay "connected" to a ghost.
 *
 * @param {import('socket.io').Server} io - the Socket.io server
 * @param {string} playerId - the id of the player who left
 * @returns {void}
 */
export function removeFromPeers(io, playerId) {
  const formerPeers = peerSets.get(playerId);
  peerSets.delete(playerId);

  // They never had a peer set (e.g. left before the first tick): nobody to tell.
  if (!formerPeers) {
    return;
  }

  for (const peerId of formerPeers) {
    // peerSets.get(...) may be missing if that peer is leaving too; `?.` then does nothing.
    peerSets.get(peerId)?.delete(playerId);
    io.to(peerId).emit(EVENTS.PEERS_UPDATE, { entered: [], left: [playerId], changed: [] });
    console.log(`[tick] left (disconnected): ${playerId} <-> ${describe(peerId)}`);
  }
}

/** A readable label for logs, e.g. "Riya (kX9a2bQ)". Falls back to the id if they're gone. */
function describe(playerId) {
  const player = getPlayer(playerId);
  return player ? `${player.name} (${playerId})` : playerId;
}
