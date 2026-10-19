# client/src/rtc/ — Module 1, microphone and voice connections

**Owner:** Person 1 (Aryan), branch `aryan`.

**Purpose:** turns on the microphone and makes one direct WebRTC voice connection to each nearby person. The voice goes browser to browser; the server only passes the setup notes.

**Interface:** `getMicStream`, `createRtcManager`, `RtcLab`. See `CONTRACTS.md`, "Client module interfaces".

**Test page:** `http://localhost:5173/?lab=rtc`

**Plan:** [`docs/briefs/module-1-signaling-webrtc.md`](../../../docs/briefs/module-1-signaling-webrtc.md), Tasks 7–11.
