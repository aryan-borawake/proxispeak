// client/src/world/fakeNet.js — Person 3
// A pretend server connection with wandering bots for testing the world alone.
// Implements the exact same interface as client/src/net/index.js.

import { STATE_BROADCAST_MS, DIRECTIONS } from '@shared/constants.js';

const BOT_NAMES = ['Alex', 'Sam', 'Riya', 'Taylor', 'Jordan', 'Morgan', 'Casey', 'Riley'];

/**
 * Creates a fake net interface with autonomous wandering bots.
 */
export function createFakeNet({ bots = 3 } = {}) {
  const listeners = {
    state: new Set(),
    joined: new Set(),
    left: new Set(),
    peers: new Set(),
    signal: new Set(),
  };

  // Generate initial bots scattered across office zones
  const botList = [];
  const startPositions = [
    { x: 320, y: 350, dir: 'down' }, // Hallway outside Lobby
    { x: 450, y: 160, dir: 'left' }, // Meeting Room table
    { x: 260, y: 560, dir: 'up' },   // Open Desks area
    { x: 920, y: 160, dir: 'down' }, // Stage area
    { x: 880, y: 580, dir: 'left' }, // Lounge area
  ];

  for (let i = 0; i < bots; i++) {
    const pos = startPositions[i % startPositions.length];
    botList.push({
      id: `bot-${i + 1}`,
      name: BOT_NAMES[i % BOT_NAMES.length] || `Bot ${i + 1}`,
      x: pos.x + (i >= startPositions.length ? (i * 20) % 100 : 0),
      y: pos.y,
      dir: pos.dir,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      changeTimer: Math.floor(Math.random() * 20),
    });
  }

  // Periodic broadcast simulating the server's 100 ms state broadcast
  const intervalId = setInterval(() => {
    // Move bots with a gentle wander
    botList.forEach((b) => {
      b.changeTimer--;
      if (b.changeTimer <= 0) {
        // Change wander direction
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 1.5;
        b.vx = Math.cos(angle) * speed;
        b.vy = Math.sin(angle) * speed;
        b.changeTimer = 15 + Math.floor(Math.random() * 25);

        if (Math.abs(b.vx) > Math.abs(b.vy)) {
          b.dir = b.vx > 0 ? 'right' : 'left';
        } else {
          b.dir = b.vy > 0 ? 'down' : 'up';
        }
      }

      // Step position
      b.x = Math.round(b.x + b.vx);
      b.y = Math.round(b.y + b.vy);
    });

    const payload = {
      t: Date.now(),
      players: botList.map((b) => ({
        id: b.id,
        name: b.name,
        x: b.x,
        y: b.y,
        dir: b.dir,
      })),
    };

    listeners.state.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('[fakeNet] Error in state listener:', err);
      }
    });
  }, STATE_BROADCAST_MS);

  return {
    connect({ name } = {}) {
      return Promise.resolve({
        selfId: 'self-local',
        roomId: 'office-1',
        spawn: { x: 150, y: 150 },
        players: botList.map((b) => ({
          id: b.id,
          name: b.name,
          x: b.x,
          y: b.y,
          dir: b.dir,
        })),
      });
    },

    sendMove({ x, y, dir }) {
      // Echo or handle local player move if needed
    },

    onPlayersState(cb) {
      listeners.state.add(cb);
      return () => listeners.state.delete(cb);
    },

    onPlayerJoined(cb) {
      listeners.joined.add(cb);
      return () => listeners.joined.delete(cb);
    },

    onPlayerLeft(cb) {
      listeners.left.add(cb);
      return () => listeners.left.delete(cb);
    },

    onPeersUpdate(cb) {
      listeners.peers.add(cb);
      return () => listeners.peers.delete(cb);
    },

    onSignal(cb) {
      listeners.signal.add(cb);
      return () => listeners.signal.delete(cb);
    },

    sendSignal({ to, data }) {
      // Mock signaling handshake for local testing
    },

    destroy() {
      clearInterval(intervalId);
      listeners.state.clear();
      listeners.joined.clear();
      listeners.left.clear();
      listeners.peers.clear();
      listeners.signal.clear();
    },
  };
}
