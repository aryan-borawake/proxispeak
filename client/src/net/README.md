# client/src/net/ — Module 1, browser connection

**Owner:** Person 1 (Aryan), branch `aryan`.

**Purpose:** the browser's one connection to the server (Socket.io). Every other module uses it: the world sends positions through it, and WebRTC passes its setup notes through it.

**Interface:** the `net` object (`connect`, `sendMove`, `on…` listeners, `sendSignal`). See `CONTRACTS.md`, "Client module interfaces".

**Plan:** [`docs/briefs/module-1-signaling-webrtc.md`](../../../docs/briefs/module-1-signaling-webrtc.md), Task 4.
