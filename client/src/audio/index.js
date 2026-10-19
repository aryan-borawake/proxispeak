// client/src/audio/index.js — Person 4 (Module 4: Spatial audio)
// The list of things other modules may use from the audio module.
// Exact names and shapes: CONTRACTS.md. Plan: docs/briefs/module-4-audio.md.
//
// SKELETON STUB: the functions throw; AudioControls shows a placeholder.

import { createElement } from 'react';

export { AudioLab } from './AudioLab.jsx';

const BRIEF = 'docs/briefs/module-4-audio.md';

/**
 * Distance → volume (gain).
 * @param {number} distancePx - distance between me and the speaker
 * @returns {number} 0..1; exactly 0 at or beyond EARSHOT_PX
 */
export function distanceToGain(distancePx) {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 3`);
}

/**
 * Left/right offset → pan.
 * @param {number} dxPx - speaker x minus my x (positive = speaker is to my right)
 * @returns {number} -1..1; negative = speaker is to the left
 */
export function dxToPan(dxPx) {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 4`);
}

/**
 * Create the mixer: one chain (voice → gain → pan → speakers) per peer, one AudioContext in total.
 * @returns {{
 *   resume: () => Promise<void>,                          // call after a user click
 *   addPeer: (id: string, mediaStream: MediaStream) => void,
 *   removePeer: (id: string) => void,                     // disconnect every node
 *   setMode: (id: string, mode: 'falloff' | 'full') => void,
 *   update: (frame: object) => void,                      // every frame, from WorldCanvas onFrame
 * }}
 * frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }
 */
export function createMixer() {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 5`);
}

/**
 * Measure how loud a stream (my microphone) is right now.
 * @param {MediaStream} stream
 * @returns {{ getLevel: () => number, stop: () => void }} getLevel returns 0..1
 */
export function createMicMeter(stream) {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 8`);
}

/**
 * Mic level bar plus a mute button. The button calls onToggleMute; Person 1's code does the muting.
 * @param {{ micStream: MediaStream, muted: boolean, onToggleMute: (muted: boolean) => void }} props
 */
export function AudioControls({ micStream, muted, onToggleMute }) {
  // Placeholder written without JSX because this is a .js file. Replace it with the real controls.
  return createElement('div', null, `AudioControls — not built yet (see ${BRIEF}, Task 8)`);
}
