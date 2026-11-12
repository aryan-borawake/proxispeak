// client/src/net/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The browser's one connection to the server. Every module uses `net`:
// the world sends positions through it, and WebRTC passes its setup notes through it.
// Exact names and payloads: CONTRACTS.md, sections 4 and 7.
// Plan: docs/briefs/module-1-signaling-webrtc.md, Task 4 (re-join after a reconnect: Task 11).

import { io } from 'socket.io-client';
import { EVENTS } from '@shared/events.js';

// Where the server lives. In development it's our Node server on port 3001.
// When we deploy, VITE_SERVER_URL points at the Render server, e.g. https://proxispeak-server.onrender.com
// (docs/deploy.md). Vite only passes env variables that start with VITE_ to the browser, and it
// bakes the value into the built files, so changing it means building the client again.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// How long connect() (and an automatic re-join) waits for the server's reply before giving up.
// Only this file uses it, so it lives here, not in shared/constants.js.
const JOIN_TIMEOUT_MS = 5000;

// The one Socket.io connection for the whole page, created once when this file is first imported.
// autoConnect: false means "create it, but don't dial the server yet".
// So other modules can register listeners (net.onPlayerJoined, …) BEFORE we connect,
// and nothing is missed; we only dial when someone calls net.connect().
//
// If the connection drops (server restarted, wifi blip), Socket.io dials again by itself, on
// this SAME socket object. That is why every socket.on(...) listener below, and every listener
// added with net.onPlayersState(...) etc., keeps working after a reconnect: they are attached
// to the object that survives. Only the socket id changes.
const socket = io(SERVER_URL, { autoConnect: false });

// What we know after joining. Both are null until the server sends WORLD_INIT.
let selfId = null; // my id (my socket id, chosen by the server)
let joinResult = null; // the whole WORLD_INIT payload, so connect() can return it again

// The join that is happening right now, if any.
// If connect() is called twice quickly, both calls get this same promise, so we only join once.
let pendingJoin = null;

// The name this tab joined with. null until the first join works. If it is set, this tab
// was in the office, so after a reconnect we join again with the same name.
let joinedName = null;

// v5: what EVENTS.JOIN sent, so a reconnect sends the same thing again: { name } for labs, or
// { token, avatarColor } for a signed-in employee. null until the first join works.
let joinPayload = null;

// v5: the room (floor) I am in now and my status, so a reconnect puts me back on the same floor
// with the same status (the server would otherwise start me on my desk's floor, available).
let currentRoomId = null;
let currentStatus = null;

// v5: everyone who wants to know about a floor change (net.onFloorChanged).
const floorChangedCallbacks = new Set();

// Everyone who wants to know about a re-join (net.onRejoin). A Set holds each callback once.
const rejoinCallbacks = new Set();

// If a re-join is waiting for its WORLD_INIT, this function cancels it (removes its listeners).
let cancelRejoin = null;

// Am I in the office? Moves and signals are only sent after joining.
function isJoined() {
  return selfId !== null;
}

// Console logs, so we can see what the connection is doing (open DevTools → Console).
// On a reconnect after this tab had joined, we also join again (rejoin, below).
socket.on('connect', () => {
  console.log(`[net] connected to ${SERVER_URL} as ${socket.id}`);
  if (joinedName !== null && pendingJoin === null) {
    rejoin();
  }
});

// If the connection drops (server restarted, wifi lost), the server forgets us.
// So we forget the join too: a stale selfId would be wrong after reconnecting,
// because the server gives every new connection a new id. While selfId is null,
// sendMove and sendSignal send nothing (otherwise Socket.io would store them and
// send them, out of date, the moment it reconnects).
socket.on('disconnect', (reason) => {
  console.log(`[net] disconnected: ${reason}`);
  selfId = null;
  joinResult = null;
  if (cancelRejoin !== null) {
    cancelRejoin(); // a re-join was waiting; the next 'connect' starts a fresh one
  }
});

/**
 * Join again after Socket.io reconnected by itself. Called from the 'connect' listener.
 *
 * Why? After a server restart or a network blip, the server has forgotten us: we are a
 * brand-new socket with a new id, not in the office. So we send EVENTS.JOIN with the same
 * name, store the fresh WORLD_INIT (new selfId), and tell every onRejoin callback, so the
 * page can rebuild what depended on the old id (the rtc manager, the world).
 *
 * Example: I was 'a1'. The server restarts. Socket.io reconnects as 'c3'. We send
 *          { name: 'Riya' }, get WORLD_INIT { selfId: 'c3', … }, and call cb({ selfId: 'c3', … }).
 */
function rejoin() {
  console.log(`[net] reconnected; joining again as ${joinedName}`);

  const timer = setTimeout(() => {
    stopWaiting();
    console.warn(
      `[net] re-join got no answer within ${JOIN_TIMEOUT_MS} ms. Reload the page to join again.`,
    );
  }, JOIN_TIMEOUT_MS);

  function handleWorldInit(payload) {
    stopWaiting();
    selfId = payload.selfId;
    joinResult = payload;
    currentRoomId = payload.roomId;
    console.log(`[net] re-joined ${payload.roomId} as ${joinedName} (${payload.selfId})`);

    // Tell everyone. One callback that throws must not stop the others.
    // v5: signed-in joins also carry `profile` and `office`; they are passed on as well.
    for (const cb of rejoinCallbacks) {
      try {
        cb({ ...payload, selfId: payload.selfId, roomId: payload.roomId, spawn: payload.spawn, players: payload.players });
      } catch (error) {
        console.warn('[net] an onRejoin callback threw:', error);
      }
    }
  }

  function stopWaiting() {
    clearTimeout(timer);
    socket.off(EVENTS.WORLD_INIT, handleWorldInit);
    cancelRejoin = null;
  }

  cancelRejoin = stopWaiting;
  // Listen first, then send, so a very fast reply can't be missed.
  socket.on(EVENTS.WORLD_INIT, handleWorldInit);
  socket.emit(EVENTS.JOIN, rejoinPayload());
}

/**
 * v5: what to send when joining again after a reconnect: the first join's payload, and for a
 * signed-in employee also the floor I was on and my status, so nothing changes for me.
 * Example: { token: 'eyJ…', avatarColor: '#2f80ed', floorId: 'floor-2', status: 'busy' }
 */
function rejoinPayload() {
  if (!joinPayload || !('token' in joinPayload)) {
    return { name: joinedName };
  }
  const payload = { ...joinPayload };
  if (currentRoomId) payload.floorId = currentRoomId;
  if (currentStatus) payload.status = currentStatus;
  return payload;
}

// v5: the server moved me to another floor (my FLOOR_CHANGE, or the admin moved my department).
// It is a brand-new world: remember it, then tell every onFloorChanged callback.
socket.on(EVENTS.FLOOR_CHANGED, (payload) => {
  joinResult = payload;
  currentRoomId = payload.roomId;
  console.log(`[net] now on ${payload.roomId}`);
  for (const cb of floorChangedCallbacks) {
    try {
      cb(payload);
    } catch (error) {
      console.warn('[net] an onFloorChanged callback threw:', error);
    }
  }
});

// Show every server error in the console (for example BAD_MOVE), so mistakes are visible.
socket.on(EVENTS.SERVER_ERROR, ({ code, message }) => {
  console.warn(`[net] server error ${code}: ${message}`);
});

/**
 * Connect to the server and join the office.
 * Sends EVENTS.JOIN { name } and waits for EVENTS.WORLD_INIT.
 *
 * Example: const { selfId, spawn, players } = await net.connect({ name: 'Riya' });
 *          // selfId: 'kX9a2bQ…', spawn: { x: 200, y: 200 }, players: [ …people already here ]
 *
 * v5: a signed-in employee joins with their token instead of a name:
 *   await net.connect({ token, avatarColor: '#2f80ed' })
 * The server then takes the name from the directory and puts them on their floor; the answer also
 * holds `profile` (who I am, my desk) and `office` (the floor: tier, open wings, departments).
 *
 * @param {{ name?: string, token?: string, avatarColor?: string, floorId?: string, status?: string }} options
 * @returns {Promise<{ selfId: string, roomId: string, spawn: { x: number, y: number },
 *   players: Array<{ id: string, name: string, x: number, y: number, dir: string }> }>}
 */
function connect({ name, token, avatarColor, floorId, status }) {
  // What JOIN sends: a token join, or the old name join (labs and tests).
  const joinMessage = token ? { token, avatarColor, floorId, status } : { name };
  // 1. Already joined? Give back the same answer; don't join a second time.
  if (joinResult !== null) {
    return Promise.resolve(joinResult);
  }

  // 2. A join is already on its way? Share it instead of starting another one.
  if (pendingJoin !== null) {
    return pendingJoin;
  }

  // 3. Start a new join. A Promise is a value that arrives later:
  //    we call resolve(result) on success or reject(error) on failure.
  pendingJoin = new Promise((resolve, reject) => {
    // If the server hasn't answered in time, give up with a clear message.
    const timer = setTimeout(() => {
      fail(
        new Error(
          `[net] join timed out after ${JOIN_TIMEOUT_MS} ms. ` +
            `Is the server running at ${SERVER_URL}? Start it with "npm run dev" in server/.`,
        ),
      );
    }, JOIN_TIMEOUT_MS);

    // Once connected, say who we are.
    function sendJoin() {
      socket.emit(EVENTS.JOIN, joinMessage);
    }

    // Success: the server replied with WORLD_INIT { selfId, roomId, spawn, players }.
    function handleWorldInit(payload) {
      removeOneTimeListeners();
      selfId = payload.selfId;
      joinResult = payload;
      pendingJoin = null;
      // From now on, a reconnect joins again with this name (or token).
      joinedName = token ? payload.profile?.name || 'signed-in employee' : name;
      joinPayload = token ? { token, avatarColor } : { name };
      currentRoomId = payload.roomId;
      currentStatus = status || null;
      console.log(`[net] joined ${payload.roomId} as ${joinedName} (${payload.selfId})`);
      resolve(payload);
    }

    // The server refused the join, e.g. { code: 'BAD_NAME', message: 'Join needs a name…' }.
    function handleServerError({ code, message }) {
      fail(new Error(`[net] join refused by the server (${code}): ${message}`));
    }

    // Socket.io couldn't reach the server at all (server off, wrong URL, CORS blocked).
    function handleConnectError(error) {
      fail(
        new Error(
          `[net] could not connect to ${SERVER_URL}: ${error.message}. ` +
            `Is the server running? Start it with "npm run dev" in server/.`,
        ),
      );
    }

    // Any failure: tidy up, hang up, and let a later connect() call try again from scratch.
    function fail(error) {
      removeOneTimeListeners();
      pendingJoin = null;
      // Hang up, so Socket.io stops retrying in the background.
      socket.disconnect();
      reject(error);
    }

    // These listeners only matter during this one join. Removing them afterwards
    // means they never fire again later, and they don't pile up (a "leak").
    function removeOneTimeListeners() {
      clearTimeout(timer);
      socket.off('connect', sendJoin);
      socket.off(EVENTS.WORLD_INIT, handleWorldInit);
      socket.off(EVENTS.SERVER_ERROR, handleServerError);
      socket.off('connect_error', handleConnectError);
    }

    // Listen FIRST, then connect, so a very fast reply can't arrive before we're listening.
    socket.on(EVENTS.WORLD_INIT, handleWorldInit);
    socket.on(EVENTS.SERVER_ERROR, handleServerError);
    socket.on('connect_error', handleConnectError);

    if (socket.connected) {
      // Still connected from before (e.g. Socket.io reconnected by itself): just join.
      sendJoin();
    } else {
      socket.on('connect', sendJoin);
      socket.connect();
    }
  });

  return pendingJoin;
}

/**
 * Send my position (EVENTS.MOVE { x, y, dir }).
 * No throttling here: Person 3's world calls this at most MOVE_SEND_HZ times a second,
 * and only when I moved (CONTRACTS.md, section 7).
 * Before joining it does nothing, because the server would only reply NOT_JOINED.
 *
 * @param {{ x: number, y: number, dir: 'up' | 'down' | 'left' | 'right' }} move
 */
function sendMove({ x, y, dir }) {
  if (!isJoined()) {
    return;
  }
  socket.emit(EVENTS.MOVE, { x, y, dir });
}

/**
 * Listen for one kind of server message, and get back a function that stops listening.
 * All five on… functions below use this.
 *
 * Example: const stop = listen(EVENTS.PLAYER_LEFT, cb);  …later…  stop();
 */
function listen(eventName, cb) {
  socket.on(eventName, cb);
  // This arrow function is the "unsubscribe function".
  return () => {
    socket.off(eventName, cb);
  };
}

/**
 * Listen for EVENTS.PLAYERS_STATE: { t, players: [{ id, x, y, dir }] }, every STATE_BROADCAST_MS.
 * @param {(state: object) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onPlayersState(cb) {
  return listen(EVENTS.PLAYERS_STATE, cb);
}

/**
 * Listen for EVENTS.PLAYER_JOINED: { id, name, x, y, dir }.
 * @param {(player: object) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onPlayerJoined(cb) {
  return listen(EVENTS.PLAYER_JOINED, cb);
}

/**
 * Listen for EVENTS.PLAYER_LEFT: { id }.
 * @param {(info: { id: string }) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onPlayerLeft(cb) {
  return listen(EVENTS.PLAYER_LEFT, cb);
}

/**
 * Listen for EVENTS.PEERS_UPDATE: { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }.
 * @param {(update: object) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onPeersUpdate(cb) {
  return listen(EVENTS.PEERS_UPDATE, cb);
}

/**
 * Listen for EVENTS.SIGNAL as delivered by the server: { from, data }.
 * @param {(signal: { from: string, data: object }) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onSignal(cb) {
  return listen(EVENTS.SIGNAL, cb);
}

/**
 * Be told when this tab joined AGAIN by itself, after a server restart or a network blip.
 * cb gets the fresh WORLD_INIT data: { selfId, roomId, spawn, players }. selfId is NEW,
 * so everything that used the old id must be rebuilt (e.g. the rtc manager).
 * Not called for the first join: that answer comes from connect().
 *
 * Example: const stop = net.onRejoin(({ selfId }) => { …make a new rtc manager… });  …later…  stop();
 *
 * @param {(init: { selfId: string, roomId: string, spawn: { x: number, y: number },
 *   players: Array<{ id: string, name: string, x: number, y: number, dir: string }> }) => void} cb
 * @returns {() => void} unsubscribe function
 */
function onRejoin(cb) {
  rejoinCallbacks.add(cb);
  return () => {
    rejoinCallbacks.delete(cb);
  };
}

/**
 * Send a WebRTC setup note (EVENTS.SIGNAL { to, data }) to one other browser through the server.
 * data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
 * The server adds `from` itself, so we never send it.
 * Before joining it does nothing.
 *
 * @param {{ to: string, data: object }} signal
 */
function sendSignal({ to, data }) {
  if (!isJoined()) {
    return;
  }
  socket.emit(EVENTS.SIGNAL, { to, data });
}

// ---------------------------------------------------------------- v5: the Infotact office

/**
 * Tell everyone in my room my new status (EVENTS.PLAYER_STATUS { status }); one of STATUSES.
 * Do Not Disturb makes the server hang up all my voice connections.
 * @param {'available' | 'busy' | 'dnd'} status
 */
function sendStatus(status) {
  currentStatus = status;
  if (!isJoined()) {
    return;
  }
  socket.emit(EVENTS.PLAYER_STATUS, { status });
}

/** Listen for EVENTS.PLAYER_STATUS: { id, status }. Returns an unsubscribe function. */
function onPlayerStatus(cb) {
  return listen(EVENTS.PLAYER_STATUS, cb);
}

/** Listen for EVENTS.OFFICE_UPDATE: the floor's new snapshot. Returns an unsubscribe function. */
function onOfficeUpdate(cb) {
  return listen(EVENTS.OFFICE_UPDATE, cb);
}

/**
 * Ask to go to another floor (EVENTS.FLOOR_CHANGE { floorId }). The answer arrives as
 * EVENTS.FLOOR_CHANGED, given to every net.onFloorChanged callback.
 * @param {string} floorId - e.g. 'floor-2'
 */
function changeFloor(floorId) {
  if (!isJoined()) {
    return;
  }
  socket.emit(EVENTS.FLOOR_CHANGE, { floorId });
}

/**
 * Be told when I am on a new floor: cb gets the WORLD_INIT-shaped payload of the new floor
 * ({ selfId, roomId, spawn, players, profile, office }). My selfId stays the same, but every other
 * person is different, so the page rebuilds the rtc manager and remounts the world.
 * @returns {() => void} unsubscribe function
 */
function onFloorChanged(cb) {
  floorChangedCallbacks.add(cb);
  return () => {
    floorChangedCallbacks.delete(cb);
  };
}

/**
 * Leave the office on purpose ("Leave" button, sign out). Hangs up and forgets the join, so a
 * later net.connect() joins from scratch, and a reconnect does NOT join again by itself.
 */
function leave() {
  joinedName = null;
  joinPayload = null;
  currentRoomId = null;
  currentStatus = null;
  joinResult = null;
  selfId = null;
  if (cancelRejoin !== null) {
    cancelRejoin();
  }
  socket.disconnect();
}

// ---------------------------------------------------------------- v6: area chat, layouts

/**
 * Post a message in the chat of the area I'm standing in (EVENTS.CHAT_SEND { text }). The server
 * works out the area and sends EVENTS.CHAT_MESSAGE to everyone standing in it (me too).
 * @param {string} text
 */
function sendChat(text) {
  if (!isJoined()) {
    return;
  }
  socket.emit(EVENTS.CHAT_SEND, { text });
}

/** Listen for EVENTS.CHAT_MESSAGE: { areaId, areaName, from: { id, name }, text, t }. Returns an unsubscribe function. */
function onChatMessage(cb) {
  return listen(EVENTS.CHAT_MESSAGE, cb);
}

/** Listen for EVENTS.LAYOUT_UPDATE: { floorId, version } (the admin uploaded a new layout). Returns an unsubscribe function. */
function onLayoutUpdate(cb) {
  return listen(EVENTS.LAYOUT_UPDATE, cb);
}

/** Listen for EVENTS.SERVER_ERROR: { code, message } (e.g. BAD_CHAT). Returns an unsubscribe function. */
function onServerError(cb) {
  return listen(EVENTS.SERVER_ERROR, cb);
}

// The one object every module imports: import { net } from '../net/index.js';
// The functions in CONTRACTS.md, section 7 (v5 adds sendStatus … leave; v6 adds sendChat … onServerError).
export const net = {
  connect,
  sendMove,
  onPlayersState,
  onPlayerJoined,
  onPlayerLeft,
  onPeersUpdate,
  onSignal,
  onRejoin,
  sendSignal,
  sendStatus,
  onPlayerStatus,
  onOfficeUpdate,
  changeFloor,
  onFloorChanged,
  leave,
  sendChat,
  onChatMessage,
  onLayoutUpdate,
  onServerError,
};

// The server's address, for the product pages' REST calls (sign-in, admin).
export { SERVER_URL };
