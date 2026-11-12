// server/signaling/tick.js — Person 1 (Module 1: Signaling + WebRTC)
// The proximity tick: 4 times a second (every PROXIMITY_TICK_MS = 250 ms) the server asks
// "who can hear whom?" and tells each browser who came in (entered), who went (left) and whose
// volume mode changed (changed). The steps follow CONTRACTS.md section 6, "The proximity tick".
//
// Why a timer and not on every move? Moves arrive up to 10 times a second per person. "Who can hear
// whom" changes slowly, so 4 checks a second are enough, and each check costs MongoDB queries.
//
// Peer sets: for every player we keep a Set of the ids they are connected to.
// A Set is like an array that can't hold the same value twice.
// Example: peerSets.get('riya') → Set { 'sam', 'lee' }
// Peers are SYMMETRIC: if Sam is in Riya's set, Riya is in Sam's set.
//
// v6, the room rules (server/geo/canHear.js) decide who connects:
//   - open floor: within EARSHOT_PX (connect) / DISCONNECT_PX (stay), mode 'falloff';
//   - the same private area: everyone inside, ANY distance, mode 'full';
//   - silent areas: nobody; the stage hall: the platform reaches the whole hall at 'full';
//   - Do Not Disturb: nobody, ever.
// Which area each player is in comes from ONE $geoWithin aggregate per room per tick (geo.locateUsers),
// or from the in-memory check (areaAt) when MongoDB is not available.
// MAX_PEERS: nobody gets more than 8 connections, checked for BOTH people of a pair. When someone is
// full, their least relevant connection makes way for a more relevant one: stage speaker and same-room
// people first ('full'), then the nearest on open floor.

import { performance } from 'node:perf_hooks';
import { EVENTS } from '../../shared/events.js';
import { AUDIO_MODES, DISCONNECT_PX, MAX_PEERS, PROXIMITY_TICK_MS, STATUSES, TICK_STATS_LOG_MS, ZONE_TYPES } from '../../shared/constants.js';
import { areaAt, canHear, isOnPlatform } from '../geo/canHear.js';
import { getPlayer, listPlayers, listPlayersInRoom } from './players.js';
// "Who is near" has two possible sources (Task 9): Person 2's geo engine (MongoDB) when server/index.js
// could start it, or our in-memory fake (fakeNearby.js) when it couldn't (geo is null).
import { findNearby as fakeFindNearby } from './fakeNearby.js';
import { getRoomAreas } from './roomAreas.js';

// id → Set of peer ids. Only this file changes it.
const peerSets = new Map();

// id → Map(peerId → mode): how `id` hears `peerId` right now ('full' or 'falloff'). Directional:
// on a stage the audience hears the speaker 'full', the speaker hears the audience 'falloff'.
const peerModes = new Map();

// How a link ranks for one of its two people (smaller = more relevant). See rankOf.
const RANK_FULL = 0;
const RANK_FALLOFF = 1_000_000;
const RANK_ONLY_FOR_THE_OTHER = 2_000_000;

// Timing of recent ticks, for the log line every TICK_STATS_LOG_MS (stage 6, load test).
const stats = { durationsMs: [], moved: 0, ticks: 0 };
let lastStats = null; // the last logged window, for GET /api/health

// With more people online than this, the per-pair "entered" / "left" log lines are skipped: writing
// hundreds of lines a second to the console would itself slow the server down (and the load test).
const PAIR_LOG_MAX_ONLINE = 20;
const pairLogsOn = () => listPlayers().length <= PAIR_LOG_MAX_ONLINE;

/** This player's peer set, created empty the first time it is needed ("lazily"). */
function getPeerSet(playerId) {
  let peerSet = peerSets.get(playerId);
  if (!peerSet) {
    peerSet = new Set();
    peerSets.set(playerId, peerSet);
  }
  return peerSet;
}

/** This player's "how I hear each peer" map, created empty the first time. */
function getModeMap(playerId) {
  let modes = peerModes.get(playerId);
  if (!modes) {
    modes = new Map();
    peerModes.set(playerId, modes);
  }
  return modes;
}

/**
 * Are these two players peers right now (is b in a's peer set)?
 * The SIGNAL handler (index.js) uses this to pass WebRTC notes only between connected people.
 * Example: Riya's set is { 'sam' } → arePeers('riya', 'sam') is true, arePeers('riya', 'lee') is false.
 */
export function arePeers(a, b) {
  return peerSets.get(a)?.has(b) === true;
}

/** How many connections a player has now (tests and the stats log). */
export function peerCount(playerId) {
  return peerSets.get(playerId)?.size || 0;
}

/**
 * Start the proximity tick. Call this ONCE, from attachSignaling.
 * @param {import('socket.io').Server} io - the Socket.io server
 * @param {(roomId: string) => object | null} geoFor - Person 2's engine for one room, or null (the fake)
 */
export function startProximityTick(io, geoFor) {
  // findNearby and locateUsers are async. This flag stops a second tick starting while the first is
  // still waiting for MongoDB, so two ticks never change the same peer sets at the same time.
  let tickIsRunning = false;

  const timer = setInterval(async () => {
    if (tickIsRunning) return;
    tickIsRunning = true;
    try {
      await runProximityTick(io, geoFor);
    } catch (error) {
      // Never let one bad tick crash the server. The next tick tries again.
      console.error('[tick] the proximity tick failed, skipped; will try again next tick:', error);
    } finally {
      tickIsRunning = false;
    }
  }, PROXIMITY_TICK_MS);
  timer.unref(); // this timer alone is not a reason for Node to keep running

  const statsTimer = setInterval(logTickStats, TICK_STATS_LOG_MS);
  statsTimer.unref();
}

/**
 * One proximity tick. The numbered steps match CONTRACTS.md section 6.
 *
 * Example: Riya and Sam are both inside 'Meeting room 2', 250 px apart (beyond earshot).
 *   locateUsers → both in 'meeting-2' (private) → canHear → { audible: true, mode: 'full' }
 *   → both get peers:update entered [{ id: other, mode: 'full' }].
 */
async function runProximityTick(io, geoFor) {
  // 1. Who is new or moved since the last tick? Nobody → nothing to do.
  const movedPlayers = listPlayers().filter((player) => player.moved === true);
  if (movedPlayers.length === 0) return;
  const startedAt = performance.now();

  // 7. (done early on purpose) Clear the "moved" flags NOW, before any waiting, so a move that
  //    arrives while we wait sets the flag again and is picked up by the next tick.
  for (const player of movedPlayers) player.moved = false;

  // 2. Save the movers' positions in MongoDB: ONE bulkWrite per room (one geo engine per floor).
  const moversByRoom = new Map();
  for (const player of movedPlayers) {
    const list = moversByRoom.get(player.roomId) || [];
    list.push(player);
    moversByRoom.set(player.roomId, list);
  }
  try {
    await Promise.all(
      [...moversByRoom].map(([roomId, movers]) => geoFor(roomId)?.upsertPositions(movers.map(({ id, x, y }) => ({ id, x, y })))),
    );
  } catch (error) {
    // Without fresh positions we can't trust any answer: put the flags back and skip this tick.
    for (const player of movedPlayers) player.moved = true;
    throw error;
  }

  // 3. v6: which area is everyone in? One $geoWithin aggregate per room that had movers.
  await Promise.all([...moversByRoom.keys()].map((roomId) => locateRoom(roomId, geoFor(roomId))));

  // 4. "Who is near?" for every mover, in parallel (the open-floor candidates). One failure → null.
  const nearbyLists = await Promise.all(
    movedPlayers.map((player) =>
      askWhoIsNear(geoFor(player.roomId), player).catch((error) => {
        console.error(`[tick] findNearby failed for ${player.id}:`, error);
        return null;
      }),
    ),
  );

  // 5. Decide, one mover after another (no more waiting), so each step sees the previous step's
  //    peer sets: if Riya and Sam both moved, Riya's step connects them and Sam's step finds it done.
  const changes = new Map();
  for (let i = 0; i < movedPlayers.length; i += 1) {
    const player = movedPlayers[i];
    if (nearbyLists[i] === null || !getPlayer(player.id)) continue; // failed, or left meanwhile
    try {
      updatePeersOf(player, nearbyLists[i], changes);
    } catch (error) {
      console.error(`[tick] could not update peers for ${player.id}:`, error);
    }
  }

  // 6. One peers:update per affected browser.
  sendPeerUpdates(io, changes);

  stats.ticks += 1;
  stats.moved += movedPlayers.length;
  stats.durationsMs.push(performance.now() - startedAt);
}

/**
 * Write each player's area (and "on the stage platform?") onto the player, for one room.
 * With MongoDB: geo.locateUsers (a $geoWithin aggregate). Without, or if it fails: in memory.
 */
async function locateRoom(roomId, geo) {
  const areas = getRoomAreas(roomId);
  const players = listPlayersInRoom(roomId);
  if (areas.length === 0) {
    for (const player of players) {
      player.area = null;
      player.onPlatform = false;
    }
    return;
  }
  const areasById = new Map(areas.map((area) => [area.id, area]));
  let located = null;
  if (geo?.locateUsers) {
    try {
      located = await geo.locateUsers(areas);
    } catch (error) {
      console.error(`[tick] locateUsers failed for ${roomId}, using the in-memory check this tick:`, error.message);
    }
  }
  for (const player of players) {
    if (located) {
      const where = located.get(player.id);
      player.area = where ? areasById.get(where.areaId) || null : null;
      player.onPlatform = Boolean(where?.onPlatform);
    } else {
      player.area = areaAt(areas, player.x, player.y);
      player.onPlatform = isOnPlatform(player.area, player.x, player.y);
    }
  }
}

/**
 * "Who is within DISCONNECT_PX of this player?" (open-floor candidates), same room only.
 * A DND player needs no candidates: the rules will drop all their links anyway.
 */
async function askWhoIsNear(geo, player) {
  if (player.status === STATUSES.DND) return [];
  const nearby = geo ? await geo.findNearby(player.id, DISCONNECT_PX) : await fakeFindNearby(player.id, DISCONNECT_PX);
  return nearby.filter((entry) => getPlayer(entry.id)?.roomId === player.roomId);
}

/**
 * Re-decide every link of one mover.
 * Candidates: people near them (open floor), everyone in the same private area or stage hall
 * (any distance), and their current peers (to drop the ones they can no longer hear).
 */
function updatePeersOf(mover, nearby, changes) {
  const candidateIds = new Set(nearby.map((entry) => entry.id));
  for (const id of getPeerSet(mover.id)) candidateIds.add(id);
  if (mover.area && (mover.area.type === ZONE_TYPES.PRIVATE || mover.area.type === ZONE_TYPES.STAGE)) {
    for (const other of listPlayersInRoom(mover.roomId)) {
      if (other.area?.id === mover.area.id) candidateIds.add(other.id);
    }
  }
  candidateIds.delete(mover.id);

  // Drop the links the rules no longer allow; collect the ones they want.
  const wanted = [];
  for (const otherId of candidateIds) {
    const other = getPlayer(otherId);
    const connected = arePeers(mover.id, otherId);
    if (!other || other.roomId !== mover.roomId) {
      if (connected) disconnectPair(mover.id, otherId, changes);
      continue;
    }
    const link = describeLink(mover, other, connected);
    if (!link.wanted) {
      if (connected) disconnectPair(mover.id, otherId, changes);
      continue;
    }
    wanted.push({ other, link });
  }

  // Most relevant first (for the mover). Keep or connect, respecting MAX_PEERS on BOTH sides.
  wanted.sort((first, second) => first.link.rankA - second.link.rankA);
  for (const { other, link } of wanted) {
    if (arePeers(mover.id, other.id)) {
      setModes(mover.id, other.id, link.modeForA, link.modeForB, changes);
      continue;
    }
    if (!makeRoomFor(mover, link.rankA, changes)) break; // full of better links: the rest rank lower still
    if (!makeRoomFor(other, link.rankB, changes)) continue; // the other person is full of better links
    connectPair(mover.id, other.id, link.modeForA, link.modeForB, changes);
  }
}

/**
 * Everything the tick needs to know about one possible link a ↔ b.
 * Example: a in the hall audience, b on the stage platform, 300 px apart
 *   a hears b → full (rank 300); b hears a → no (too far; rank 2 000 300) → wanted (a needs it).
 */
function describeLink(a, b, connected) {
  const aHearsB = canHear(a, b, { connected });
  const bHearsA = canHear(b, a, { connected });
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    wanted: aHearsB.audible || bHearsA.audible,
    modeForA: aHearsB.mode,
    modeForB: bHearsA.mode,
    rankA: rankOf(aHearsB, distance),
    rankB: rankOf(bHearsA, distance),
  };
}

/** Smaller = more relevant: 'full' links, then 'falloff' links, then links only the other side needs; nearest first within each. */
function rankOf(hearing, distance) {
  if (!hearing.audible) return RANK_ONLY_FOR_THE_OTHER + distance;
  return (hearing.mode === AUDIO_MODES.FULL ? RANK_FULL : RANK_FALLOFF) + distance;
}

/**
 * Make sure `player` has a free connection slot for a link ranked `newRank`.
 * Free slot → true. Full → drop their least relevant link if it ranks worse than the new one → true.
 * Otherwise (all 8 links are more relevant) → false.
 */
function makeRoomFor(player, newRank, changes) {
  const peerSet = getPeerSet(player.id);
  if (peerSet.size < MAX_PEERS) return true;
  let worstId = null;
  let worstRank = -1;
  for (const peerId of peerSet) {
    const peer = getPlayer(peerId);
    const rank = peer ? describeLink(player, peer, true).rankA : Infinity;
    if (rank > worstRank) {
      worstRank = rank;
      worstId = peerId;
    }
  }
  if (worstId === null || worstRank <= newRank) return false;
  disconnectPair(player.id, worstId, changes);
  return true;
}

/**
 * Hang up ALL of one player's voice connections now, and tell BOTH sides (peers:update "left").
 * Used when a player turns on Do Not Disturb or changes floor.
 */
export function disconnectAllPeers(io, playerId) {
  const peerSet = peerSets.get(playerId);
  if (!peerSet || peerSet.size === 0) return;
  const changes = new Map();
  for (const otherId of [...peerSet]) disconnectPair(playerId, otherId, changes);
  sendPeerUpdates(io, changes);
}

/**
 * Note how a pair looked BEFORE this tick touched it (once per tick), so sendPeerUpdates can report
 * only the net result. Example: dropped for someone nearer and then re-added in the same tick → nothing to say.
 */
function remember(changes, playerId, otherId) {
  let touched = changes.get(playerId);
  if (!touched) {
    touched = new Map();
    changes.set(playerId, touched);
  }
  if (!touched.has(otherId)) {
    touched.set(otherId, { wasConnected: arePeers(playerId, otherId), oldMode: peerModes.get(playerId)?.get(otherId) || null });
  }
}

/** Connect two players (both sets), with the mode each one hears the other in. */
function connectPair(playerId, otherId, modeForPlayer, modeForOther, changes) {
  if (!getPlayer(playerId) || !getPlayer(otherId) || arePeers(playerId, otherId)) return;
  remember(changes, playerId, otherId);
  remember(changes, otherId, playerId);
  getPeerSet(playerId).add(otherId);
  getPeerSet(otherId).add(playerId);
  getModeMap(playerId).set(otherId, modeForPlayer);
  getModeMap(otherId).set(playerId, modeForOther);
  if (pairLogsOn()) console.log(`[tick] entered: ${describe(playerId)} <-> ${describe(otherId)} (${modeForPlayer}/${modeForOther})`);
}

/** Update the modes of a pair that stays connected (e.g. both walked into a meeting room). */
function setModes(playerId, otherId, modeForPlayer, modeForOther, changes) {
  if (getModeMap(playerId).get(otherId) !== modeForPlayer) {
    remember(changes, playerId, otherId);
    getModeMap(playerId).set(otherId, modeForPlayer);
  }
  if (getModeMap(otherId).get(playerId) !== modeForOther) {
    remember(changes, otherId, playerId);
    getModeMap(otherId).set(playerId, modeForOther);
  }
}

/** Disconnect two players (both sets). Does nothing if they are not connected. */
function disconnectPair(playerId, otherId, changes) {
  if (!arePeers(playerId, otherId)) return;
  remember(changes, playerId, otherId);
  remember(changes, otherId, playerId);
  getPeerSet(playerId).delete(otherId);
  getPeerSet(otherId).delete(playerId);
  peerModes.get(playerId)?.delete(otherId);
  peerModes.get(otherId)?.delete(playerId);
  if (pairLogsOn()) console.log(`[tick] left: ${describe(playerId)} <-> ${describe(otherId)}`);
}

/**
 * Emit EVENTS.PEERS_UPDATE to every player whose links changed:
 *   { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }
 * Compares each touched pair before and after the tick, so a browser never gets "left" and
 * "entered" for the same person in one message. `io.to(id)` reaches exactly that one browser.
 */
function sendPeerUpdates(io, changes) {
  for (const [playerId, touched] of changes) {
    const update = { entered: [], left: [], changed: [] };
    for (const [otherId, { wasConnected, oldMode }] of touched) {
      const nowConnected = arePeers(playerId, otherId);
      const mode = peerModes.get(playerId)?.get(otherId) || AUDIO_MODES.FALLOFF;
      if (!wasConnected && nowConnected) update.entered.push({ id: otherId, mode });
      else if (wasConnected && !nowConnected) update.left.push(otherId);
      else if (wasConnected && nowConnected && mode !== oldMode) update.changed.push({ id: otherId, mode });
    }
    if (update.entered.length + update.left.length + update.changed.length > 0) {
      io.to(playerId).emit(EVENTS.PEERS_UPDATE, update);
    }
  }
}

/**
 * A player disconnected: take them out of every peer set, and tell each former peer at once with
 * peers:update { entered: [], left: [thatId], changed: [] }. (The tick only checks players who
 * moved; a peer standing still would otherwise stay connected to a ghost.)
 */
export function removeFromPeers(io, playerId) {
  const formerPeers = peerSets.get(playerId);
  peerSets.delete(playerId);
  peerModes.delete(playerId);
  if (!formerPeers) return;
  for (const peerId of formerPeers) {
    peerSets.get(peerId)?.delete(playerId);
    peerModes.get(peerId)?.delete(playerId);
    io.to(peerId).emit(EVENTS.PEERS_UPDATE, { entered: [], left: [playerId], changed: [] });
    if (pairLogsOn()) console.log(`[tick] left (disconnected): ${playerId} <-> ${describe(peerId)}`);
  }
}

/** Mark everyone in a room as moved, so the next tick re-checks them all (e.g. after a new layout). */
export function recheckRoom(roomId) {
  for (const player of listPlayersInRoom(roomId)) player.moved = true;
}

/**
 * Every TICK_STATS_LOG_MS: how long the ticks took (average, 95th percentile, slowest), how many
 * players moved, and how many connections each online player has. Silent when nothing happened.
 * The 95th percentile ("p95"): 95 % of ticks were at least this fast.
 */
function logTickStats() {
  if (stats.ticks === 0) return;
  const sorted = [...stats.durationsMs].sort((a, b) => a - b);
  const average = sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const slowest = sorted[sorted.length - 1];
  const online = listPlayers();
  const counts = online.map((player) => peerCount(player.id));
  const peersAverage = counts.length ? counts.reduce((sum, n) => sum + n, 0) / counts.length : 0;
  const peersMax = counts.length ? Math.max(...counts) : 0;
  console.log(
    `[tick] stats ${TICK_STATS_LOG_MS / 1000}s: ${stats.ticks} ticks, avg ${average.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ` +
      `max ${slowest.toFixed(1)} ms, moved ${(stats.moved / stats.ticks).toFixed(1)}/tick, online ${online.length}, ` +
      `peers/user avg ${peersAverage.toFixed(1)} max ${peersMax}`,
  );
  lastStats = {
    windowS: TICK_STATS_LOG_MS / 1000,
    ticks: stats.ticks,
    avgMs: Number(average.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    maxMs: Number(slowest.toFixed(2)),
    movedPerTick: Number((stats.moved / stats.ticks).toFixed(1)),
    online: online.length,
    peersPerUserAvg: Number(peersAverage.toFixed(2)),
    peersPerUserMax: peersMax,
    at: new Date().toISOString(),
  };
  stats.durationsMs = [];
  stats.moved = 0;
  stats.ticks = 0;
}

/** The last logged tick-timing window (or null before the first one). Shown by GET /api/health. */
export function getLastTickStats() {
  return lastStats;
}

/** A readable label for logs, e.g. "Riya (kX9a2bQ)". Falls back to the id if they're gone. */
function describe(playerId) {
  const player = getPlayer(playerId);
  return player ? `${player.name} (${playerId})` : playerId;
}
