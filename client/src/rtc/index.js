// client/src/rtc/index.js — Person 1 (Module 1: Signaling + WebRTC)
// The microphone and the direct voice connections (one RTCPeerConnection per nearby person).
// Exact names and shapes: CONTRACTS.md, section 7. Plan: docs/briefs/module-1-signaling-webrtc.md.
//
// This file is the module's "front door": code OUTSIDE client/src/rtc imports from here only.
// (RtcLab.jsx, inside the folder, imports mic.js and rtcManager.js directly, to avoid a loop.)
//   getMicStream      — mic.js (Task 7)
//   createRtcManager  — rtcManager.js (Tasks 8–10)
//   RtcLab            — RtcLab.jsx, the test page at ?lab=rtc

export { RtcLab } from './RtcLab.jsx';
export { createRtcManager } from './rtcManager.js';
export { getMicStream } from './mic.js';
