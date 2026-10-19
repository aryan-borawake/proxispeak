// client/src/world/index.js — Person 3 (Module 3: 2D world)
// The list of things other modules may use from the world.
// Exact names and shapes: CONTRACTS.md. Plan: docs/briefs/module-3-world.md.
//
// SKELETON STUB: WorldCanvas shows a placeholder box; createFakeNet throws.

import { createElement } from 'react';

export { WorldLab } from './WorldLab.jsx';

const BRIEF = 'docs/briefs/module-3-world.md';

/**
 * The React component that draws the office and every character on a canvas, 60 times a second.
 *
 * @param {{
 *   net: object,              // the real net from client/src/net, or createFakeNet()
 *   selfId: string,           // my id
 *   spawn: { x: number, y: number },   // where I start
 *   initialPlayers: Array<{ id: string, name: string, x: number, y: number, dir: string }>,
 *   onFrame: (frame: object) => void,  // called every animation frame
 *   debug: boolean,           // show the FPS counter and the earshot circle
 * }} props
 *
 * frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }   (blocked is false until Week 3)
 */
export function WorldCanvas({ net, selfId, spawn, initialPlayers, onFrame, debug }) {
  // Placeholder written without JSX because this is a .js file. Replace it with the real canvas.
  return createElement('div', null, `WorldCanvas — not built yet (see ${BRIEF}, Task 1)`);
}

/**
 * A pretend server with wandering bots, for testing without the real server.
 * Has exactly the same functions as `net`: connect, sendMove, onPlayersState, onPlayerJoined,
 * onPlayerLeft, onPeersUpdate, onSignal, sendSignal.
 *
 * @param {{ bots: number }} options - how many bots wander around
 * @returns {object} an object shaped like `net`
 */
export function createFakeNet({ bots }) {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 5`);
}
