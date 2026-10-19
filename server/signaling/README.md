# server/signaling/ — Module 1, server half

**Owner:** Person 1 (Aryan), branch `aryan`.

**Purpose:** the app's post office. It keeps every player's position in memory, handles join, move and leave, sends everyone's positions 10 times a second, runs the "who is near whom?" check 4 times a second, and passes WebRTC setup notes between browsers. It never hears the voices.

**Interface:** `attachSignaling(io, { geo })`. See `CONTRACTS.md`, "Server module interfaces".

**Plan:** [`docs/briefs/module-1-signaling-webrtc.md`](../../docs/briefs/module-1-signaling-webrtc.md). The work in this folder starts at Task 2.
