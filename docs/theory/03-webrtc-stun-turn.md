# 03 — WebRTC, STUN and TURN

*Code: `client/src/rtc/rtcManager.js` (the manager), `client/src/rtc/mic.js` (microphone), `client/src/app/useVoiceSession.js` (wiring), server relay in `server/signaling/index.js` (`handleSignal`). Settings: `.env.example`, `render.yaml`, `client/vite.config.js`.*

**WebRTC** is the browser's built-in system for sending audio (and video) directly from one browser to another. One direct connection is an **`RTCPeerConnection`** object. ProxiSpeak makes one per nearby person.

---

## 1. Why WebRTC, and what the server still does

Example: 8 people talk in a group. If audio went through our server, it would receive 8 voices and send out 8 × 7 = 56 voice streams. Our server is a free Render instance. With WebRTC, the server sends only small text notes once per pair; the audio goes straight between the browsers.

But two browsers can't find each other alone. They need:

1. a way to swap setup notes (our server: **signaling**), and
2. help to find a network path (**STUN**, and when that fails, **TURN**).

---

## 2. The handshake, step by step

Riya has id `a1`, Sam has `b7`. The tick has just put them in each other's peer set.

```
 Riya (a1)                     server                      Sam (b7)
    │◄── peers:update entered ──┤── peers:update entered ──►│
    │ createPeer, add mic        │          createPeer, add mic│
    │ 'a1' < 'b7' → I offer      │                 I wait     │
    │── rtc:signal offer ───────►│── { from: a1, offer } ────►│
    │                            │      setRemoteDescription  │
    │                            │      createAnswer          │
    │◄── { from: b7, answer } ───│◄── rtc:signal answer ──────│
    │ setRemoteDescription       │                            │
    │◄─────── ICE candidates, both ways, through the server ──►│
    │◄═════════════ voice, directly browser to browser ═══════►│
```

In words: the server tells both browsers to connect; the one with the smaller id sends an offer through the server; the other answers through the server; both send their possible addresses through the server; then the voice flows directly between them.

The terms:

- **SDP** (Session Description Protocol): a text block that lists which audio formats a browser can send and receive, and connection settings. It starts with `v=0`.
- **Offer**: the first SDP, from the browser that starts. "Here is what I can do."
- **Answer**: the reply SDP. "Here is what I picked."
- **Local / remote description**: my own SDP (`setLocalDescription`) and the other side's SDP (`setRemoteDescription`).
- **ICE** (Interactive Connectivity Establishment): the method both browsers use to find a network path. They collect **ICE candidates** (possible addresses where they can be reached), swap them, and test pairs until one works.

In the code:

1. Both get `peers:update` `entered`. Each calls `createPeer(id)`: a new `RTCPeerConnection` with our ICE servers, and the microphone track added (`pc.addTrack`).
2. The smaller id calls `sendOffer`: `createOffer()` → `setLocalDescription(offer)` → `net.sendSignal({ to, data: { type: 'offer', sdp } })`.
3. The other side, on an offer: `setRemoteDescription(offer)` → add queued candidates → `createAnswer()` → `setLocalDescription(answer)` → send the answer.
4. The first side, on the answer: only if it is waiting for one (`signalingState === 'have-local-offer'`), `setRemoteDescription(answer)` → add queued candidates.
5. Meanwhile `pc.onicecandidate` fires for every address the browser finds; each is sent as `{ type: 'candidate', candidate }`.
6. When a path works, `connectionState` becomes `connected` and `pc.ontrack` gives the other person's audio stream, which goes to the mixer (`onRemoteStream` → `mixer.addPeer`).

---

## 3. Who sends the offer

```js
// client/src/rtc/rtcManager.js, handlePeersUpdate
if (isNew && selfId < id) {
  sendOffer(id, peer);
}
```

Plain string comparison: `'a1' < 'b7'`, so `a1` offers and `b7` only answers.

Why: if both sent an offer at the same moment ("**glare**"), each would receive an offer while waiting for an answer, and the handshake would break. A fixed rule that both sides compute the same way means exactly one offers. No extra message is needed to agree.

A detail: Sam's browser may receive Riya's offer *before* its own `peers:update` arrives (two different messages, racing). So an offer from an unknown person creates the connection on the spot: `peers.get(from) || createPeer(from)`. The server only relays the offer because they are peers, so this is safe.

---

## 4. The early-candidate queue

The rule: a browser can only use an ICE candidate after it knows the other side's description (`setRemoteDescription`). But candidates are sent the moment they are found, and they can overtake the offer or answer.

Example: Sam receives Riya's first candidate 5 ms before her offer. Calling `addIceCandidate` now would fail, and that candidate would be lost.

The fix: keep a queue per connection.

```js
// client/src/rtc/rtcManager.js
async function addOrQueueCandidate(peer, candidate) {
  if (peer.pc.remoteDescription) {
    await peer.pc.addIceCandidate(candidate);
  } else {
    peer.pendingCandidates.push(candidate);
  }
}
```

1. Remote description already set → add the candidate now.
2. Not yet → push it onto `pendingCandidates`.
3. Right after `setRemoteDescription` (for both an offer and an answer), `flushPendingCandidates` adds them all and empties the queue first, so nothing is added twice.

`createPeer` is deliberately synchronous (no `await`), so the connection object is in the `peers` Map at once, and a candidate arriving a moment later finds it and is queued instead of dropped.

Other safety checks:

- `isCurrent(id, peer)`: between two `await`s the person may have walked away (or away and back, with a new connection). Before sending the offer or answer, the code checks it is still the same connection.
- A candidate for someone we have no connection to (they walked away a moment ago) is ignored with a log line.
- `connectionState === 'failed'` → close it. No automatic retry: walking out of earshot and back in makes a fresh connection.
- `peers:update` `left` → `closePeer`: remove the handlers, `pc.close()`, tell the mixer.

---

## 5. STUN versus TURN, with a home-router example

### Why addresses are a problem

Riya's laptop is at home on Wi-Fi. Her laptop's address is `192.168.1.5`. That is a **private address**: it only means something inside her home. Her home router has one **public address** on the internet, say `203.0.113.20` (a made-up example address). The router does **NAT** (Network Address Translation): it rewrites her laptop's outgoing traffic so it seems to come from `203.0.113.20`, and passes replies back in.

Sam is on a phone on mobile data. His operator also hides many phones behind shared public addresses.

So Riya can't simply tell Sam "send to 192.168.1.5": that address doesn't exist outside her home.

### The three kinds of candidate

| Candidate type | Where it comes from | Example | Works when |
|---|---|---|---|
| **host** | the device's own network card | `192.168.1.5:54321` | both on the same network (two tabs on one laptop) |
| **srflx** ("server reflexive") | a **STUN** server reports what address it saw | `203.0.113.20:61000` | the routers let a direct path through (most home routers) |
| **relay** | a **TURN** server gives a relay address | an address on Metered's server | always, if TURN is reachable: the voice goes through the relay |

### STUN

A **STUN** server answers one question: "what is my address as the internet sees it?" Riya's browser asks Google's STUN server (`stun:stun.l.google.com:19302`), which replies "you look like `203.0.113.20:61000`". That becomes a candidate. STUN carries no audio and is cheap, which is why Google offers it free.

### TURN

Some routers (and many mobile networks and office firewalls) only accept replies from the exact address you contacted, so a direct path between Riya and Sam never opens. Then a **TURN** server (Traversal Using Relays around NAT) steps in: both browsers send their audio to the TURN server, and it forwards each voice to the other. It works almost everywhere, but it costs the TURN provider bandwidth, so it needs a username and password.

```
 direct (STUN helped):   Riya ═════════════════════════► Sam
 relayed (TURN):         Riya ═══► Metered TURN ═══════► Sam
```

In words: normally the voice goes straight between the two; if no direct path opens, it goes through Metered's relay.

ICE tries the candidate pairs and picks the best that works: direct if possible, relay if not. In Chrome you can see which: `chrome://webrtc-internals`, selected candidate pair, type `relay` means it went through TURN.

---

## 6. Our ICE settings (Metered)

```js
// client/src/rtc/rtcManager.js, buildIceServers
const iceServers = [STUN_SERVER];                       // { urls: 'stun:stun.l.google.com:19302' }
const turnUrls = splitTurnUrls(import.meta.env.VITE_TURN_URL);
const turnIsComplete = Boolean(turnUrls.length > 0 && turnUsername && turnCredential);
if (turnIsComplete) {
  iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
}
```

1. Always Google's STUN.
2. TURN only if all three are set: `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. A half-set TURN entry would only fail.
3. `VITE_TURN_URL` holds **several** addresses separated by commas. Metered gives the same relay on four ports and transports:

```
turn:standard.relay.metered.ca:80
turn:standard.relay.metered.ca:80?transport=tcp
turn:standard.relay.metered.ca:443
turns:standard.relay.metered.ca:443?transport=tcp
```

Why four? **UDP** (fast, the default for voice) on port 80, **TCP** (works through stricter firewalls) on port 80, port 443 (the HTTPS port, almost never blocked), and **TLS** on 443 (`turns:`, encrypted, looks like normal HTTPS traffic). Strict networks often block all but one, so the browser tries each. They share one username and password, so they go into **one** entry as a list of `urls`.

The console logs the addresses once per page, never the password:

```
[rtc] ICE servers: stun:stun.l.google.com:19302, turn:…:80, turn:…:80?transport=tcp, turn:…:443, turns:…:443?transport=tcp
```

If TURN is missing it says `(no TURN: VITE_TURN_URL, VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL are not all set)`.

---

## 7. Why `VITE_` values are public

**Vite** (our build tool) copies every environment variable whose name starts with `VITE_` into the JavaScript files it builds. That JavaScript is downloaded by every visitor. So:

- `VITE_SERVER_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` are **readable by anyone** who opens the site (DevTools → Sources).
- They are **baked in at build time**: changing one on Render does nothing until the client is built again.
- Variables without `VITE_` (`MONGODB_URI`, `AUTH_SECRET`, `ADMIN_PASSWORD`) never reach the browser. Vite simply doesn't copy them. `client/vite.config.js` points Vite at the repo-root `.env` (`envDir`), the same file the server reads, and this prefix rule is what keeps the server's secrets out.

A TURN credential in the browser is normal: the browser must present it to the relay. The risk is that someone else uses our free TURN quota. So the credential is created only for ProxiSpeak and can be deleted and replaced in Metered's dashboard if abused. (A stronger design would have the server hand out short-lived TURN credentials; not built.)

---

## 8. The 32 kbps limit

Why: in a mesh every connection carries its own copy of my voice. With the cap of 8 peers I upload up to 8 copies. At 32 kbps that is `8 × 32 = 256 kbps` up (and the same down), fine for home internet and mobile data. Without a limit the browser may choose a higher rate per copy.

**Opus** is the voice codec WebRTC uses (a **codec** squeezes audio into fewer bits and expands it again). Opus speech is clear at 32 kbps.

How:

```js
// client/src/rtc/rtcManager.js, limitAudioBitrate (called when connectionState is 'connected')
const parameters = sender.getParameters();
if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
parameters.encodings[0].maxBitrate = AUDIO_MAX_BITRATE_BPS; // 32000
await sender.setParameters(parameters);
```

1. Wait until the connection is `connected` (before that, the encodings list may not exist yet).
2. For each audio **sender** (the part of the connection that sends my track), set `maxBitrate` to 32 000 bits per second.
3. Log once per page: `[rtc] audio send limit: 32 kbps per connection`.
4. If the browser refuses, log a warning; the voice still works at the browser's own rate.

---

## 9. The microphone and mute

`getMicStream()` (`client/src/rtc/mic.js`) asks for `{ audio: { echoCancellation: true, noiseSuppression: true }, video: false }`.

- **Echo cancellation** stops my speakers' sound going back into my microphone.
- **Noise suppression** lowers fans and keyboard noise.
- The browser allows the microphone only on a **secure context**: an `https://` page or `localhost`. Opening the dev server as `http://192.168.x.x:5173` from a phone won't work; the code says so in its error message.
- Errors are turned into clear messages: permission denied, no microphone found.

**Mute** sets `track.enabled = false` on the microphone track. Every connection then sends silence but stays open, so unmuting is instant.

---

## 10. Limits

1. **Mesh + 8 peers**: a stage talk reaches only the 8 most relevant listeners. Beyond that needs an **SFU** (Selective Forwarding Unit: a media server that receives each voice once and forwards it to many listeners). Not built.
2. **No automatic retry** after `failed`.
3. **TURN credential is public** (see section 7).
4. **Two tabs on one laptop always work**, even without TURN (host candidates). The real test is two different networks (laptop on Wi-Fi, phone on mobile data); see `docs/deploy.md`.
