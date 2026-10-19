// client/src/rtc/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The microphone and the direct voice connections (one RTCPeerConnection per nearby person).
// Exact names and shapes: CONTRACTS.md. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// SKELETON STUB: the functions throw so nobody mistakes "not built" for "no microphone".

export { RtcLab } from './RtcLab.jsx';

const BRIEF = 'docs/briefs/module-1-signaling-webrtc.md';

/**
 * Ask the browser for the microphone.
 * @returns {Promise<MediaStream>} live microphone audio
 */
export async function getMicStream() {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 7`);
}

/**
 * Create the manager that opens and closes one voice connection per nearby person.
 * It listens to net.onPeersUpdate and net.onSignal. The person with the smaller id
 * (string comparison) sends the offer; the other only answers.
 *
 * @param {{
 *   net: object,                                   // the net object from client/src/net
 *   selfId: string,                                // my id from net.connect()
 *   micStream: MediaStream,                        // from getMicStream()
 *   onRemoteStream: (id: string, stream: MediaStream) => void,  // a voice arrived
 *   onPeerClosed: (id: string) => void,            // a connection closed
 *   onPeerMode: (id: string, mode: 'falloff' | 'full') => void, // a voice's mode changed
 * }} options
 * @returns {{ setMuted: (muted: boolean) => void, closeAll: () => void }}
 */
export function createRtcManager({ net, selfId, micStream, onRemoteStream, onPeerClosed, onPeerMode }) {
  throw new Error(`Not implemented yet — see ${BRIEF}, Task 8`);
}
