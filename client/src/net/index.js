// client/src/net/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The browser's one connection to the server. Every module uses `net`.
// Exact names and payloads: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// SKELETON STUB: every function throws, so a module that calls it too early
// sees a clear error instead of silently getting nothing.

function notImplemented() {
  throw new Error('Not implemented yet — see docs/briefs/module-1-signaling-webrtc.md, Task 4');
}

export const net = {
  /**
   * Connect to the server and join the office. Sends EVENTS.JOIN, waits for EVENTS.WORLD_INIT.
   * @param {{ name: string }} options
   * @returns {Promise<{ selfId: string, roomId: string, spawn: { x: number, y: number },
   *   players: Array<{ id: string, name: string, x: number, y: number, dir: string }> }>}
   */
  async connect({ name }) {
    notImplemented();
  },

  /**
   * Send my position (EVENTS.MOVE). Call at most MOVE_SEND_HZ times a second, only when I moved.
   * @param {{ x: number, y: number, dir: 'up' | 'down' | 'left' | 'right' }} move
   */
  sendMove({ x, y, dir }) {
    notImplemented();
  },

  /**
   * Listen for EVENTS.PLAYERS_STATE: { t, players: [{ id, x, y, dir }] }, every STATE_BROADCAST_MS.
   * @param {(state: object) => void} cb
   * @returns {() => void} unsubscribe function
   */
  onPlayersState(cb) {
    notImplemented();
  },

  /**
   * Listen for EVENTS.PLAYER_JOINED: { id, name, x, y, dir }.
   * @param {(player: object) => void} cb
   * @returns {() => void} unsubscribe function
   */
  onPlayerJoined(cb) {
    notImplemented();
  },

  /**
   * Listen for EVENTS.PLAYER_LEFT: { id }.
   * @param {(info: { id: string }) => void} cb
   * @returns {() => void} unsubscribe function
   */
  onPlayerLeft(cb) {
    notImplemented();
  },

  /**
   * Listen for EVENTS.PEERS_UPDATE: { entered: [{ id, mode }], left: [id], changed: [{ id, mode }] }.
   * @param {(update: object) => void} cb
   * @returns {() => void} unsubscribe function
   */
  onPeersUpdate(cb) {
    notImplemented();
  },

  /**
   * Listen for EVENTS.SIGNAL as delivered by the server: { from, data }.
   * @param {(signal: { from: string, data: object }) => void} cb
   * @returns {() => void} unsubscribe function
   */
  onSignal(cb) {
    notImplemented();
  },

  /**
   * Send a WebRTC setup note (EVENTS.SIGNAL) to one other browser through the server.
   * data is { type: 'offer' | 'answer', sdp } or { type: 'candidate', candidate }.
   * @param {{ to: string, data: object }} signal
   */
  sendSignal({ to, data }) {
    notImplemented();
  },
};
