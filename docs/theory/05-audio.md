# 05 — Spatial audio: volume, direction, rooms and walls

*Code: `client/src/audio/formulas.js` (Koushik: `distanceToGain`, `dxToPan`), `client/src/audio/mixer.js` (Koushik's mixer; v6 full mode, fades and wall muffling added by Aryan), `client/src/audio/micMeter.js`, wiring in `client/src/app/useVoiceSession.js`, wall check in `client/src/world/soundWalls.js`.*

**Spatial audio** means sound that seems to come from a place: louder when the speaker is near, from the left when they stand to your left.

---

## 1. The volume formula

Example first. Sam is 40 px from Riya:

```
gain = 0.5 × (1 + cos(π × 40 / 100))
     = 0.5 × (1 + cos(0.4π))
     = 0.5 × (1 + 0.309)
     ≈ 0.65
```

**Gain** is a volume multiplier: 1 = the voice as it arrives, 0.5 = half, 0 = silent.

The rule (`distanceToGain`, the default "smooth" curve):

```js
// client/src/audio/formulas.js
if (distancePx <= 0) return 1.0;
if (distancePx >= EARSHOT_PX) return 0.0;            // 100 px
const normalized = distancePx / EARSHOT_PX;          // 0 … 1
return 0.5 * (1 + Math.cos(normalized * Math.PI));   // the half-cosine curve
```

| Distance (px) | 0 | 10 | 20 | 25 | 32 (one tile) | 40 | 50 | 60 | 75 | 90 | ≥ 100 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Gain | 1.00 | 0.98 | 0.90 | 0.85 | 0.77 | 0.65 | 0.50 | 0.35 | 0.15 | 0.02 | 0 |

Why a half-cosine and not a straight line? A straight line (`1 − d/100`) has sharp corners: the volume starts dropping the moment someone takes one step back, and it hits 0 abruptly at 100 px. The cosine curve is flat near 0 px (small movements while talking face to face change little), steepest in the middle, and flat again near 100 px (the voice fades out gently instead of cutting off). `formulas.js` also has `'linear'` and `'quadratic'` curves for the Audio Lab's comparison table; the mixer uses the default, `'smooth'`.

Note: the server keeps a connection open up to 140 px (`DISCONNECT_PX`), but the gain is already 0 from 100 px. So between 100 and 140 px you hear nothing; the connection is only kept ready so it doesn't flicker (see `02-signaling-and-tick.md`).

Distance is measured between the two avatars' positions as drawn on my screen (the other avatar's smoothly interpolated position), every frame.

---

## 2. The left/right formula

Example: Sam stands 40 px to Riya's right. `dx = Sam.x − Riya.x = +40`. Pan = `40 / 80 = 0.5`: half-way towards the right ear.

**Pan** is a value from −1 (only the left ear) through 0 (both ears equally) to +1 (only the right ear).

```js
// client/src/audio/formulas.js
export function dxToPan(dxPx, panWidth = 80) {
  if (dxPx === 0) return 0.0;
  const rawPan = dxPx / panWidth;
  return Math.max(-0.9, Math.min(0.9, rawPan));
}
```

| dx (px) | −100 | −72 | −40 | −20 | 0 | +20 | +40 | +72 | +100 |
|---|---|---|---|---|---|---|---|---|---|
| Pan | −0.9 | −0.9 | −0.5 | −0.25 | 0 | +0.25 | +0.5 | +0.9 | +0.9 |

Why clamp at ±0.9 and not ±1? Sound in only one ear is uncomfortable in headphones, and someone 70 px away is still "in the room" with you. The voice never disappears from one ear completely.

Only the horizontal difference counts. Someone straight above or below you is centred (pan 0); the map is top-down, so "up" on the screen has no natural ear.

---

## 3. The Web Audio chain

The **Web Audio API** is the browser's system for processing sound as a graph of **nodes** (small sound-processing blocks connected by wires). An **AudioContext** is the object that owns the graph and the connection to the speakers.

For every remote voice, `mixer.addPeer(id, stream)` builds:

```
 remote MediaStream ──► MediaStreamSourceNode ──► GainNode ──► StereoPannerNode ──► speakers
 (Sam's voice, from WebRTC)   (turns the stream      (volume)     (left/right)        (ctx.destination)
                               into graph input)
```

In words: Sam's voice from WebRTC enters the graph, passes a volume control, then a left/right control, then goes to the speakers. Each voice has its own gain and panner, so each person can be at their own volume and side.

- A **MediaStream** is the browser object for live audio (here, Sam's voice arriving over WebRTC).
- A **GainNode** multiplies the sound by its `gain` value.
- A **StereoPannerNode** moves the sound between the ears by its `pan` value. (If a very old browser has no panner, the chain skips it.)
- A new voice starts at gain 0 and fades in.

Then 60 times a second the world calls `mixer.update(frame)`, with `frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }`. For each voice the mixer:

1. Finds that person in the frame (not there → glide to silence).
2. Computes the distance and `dx`.
3. Target gain: `distanceToGain(distance)` in `falloff` mode, or the constant full-mode gain in `full` mode (section 4).
4. If `blocked` (a wall between us, open floor only), multiply by 0.3 (section 5).
5. Target pan: `dxToPan(dx)`.
6. Glide the gain and pan towards the targets (section 6).

Why this runs in the browser and not on the server: positions change every frame on my screen, and only my browser knows exactly where everyone is drawn right now. The server only says *who* I'm connected to and in which *mode*.

---

## 4. Constant volume in private areas (`full` mode)

The server's room rules send a **mode** with every peer: `falloff` (by distance) or `full` (same private room, or I'm hearing the stage speaker). The WebRTC manager passes it on: `onPeerMode(id, mode)` → `mixer.setMode(id, mode)`.

```js
// client/src/audio/mixer.js
const FULL_MODE_GAIN = distanceToGain(TILE_SIZE); // distanceToGain(32) ≈ 0.77
…
if (peer.mode === AUDIO_MODES.FULL) {
  targetGain = FULL_MODE_GAIN;
} else {
  targetGain = distanceToGain(distance);
}
```

Example: Riya and Sam stand at opposite ends of Meeting room 2, 400 px apart. On open floor that would be silence. In the room the server says `full`, so the mixer plays Sam at 0.77 whatever the distance.

Why 0.77 and not 1.0? 0.77 is the loudness of talking face to face one tile (32 px) apart on open floor. A meeting room should sound like a normal conversation, not louder than standing next to someone.

Pan still follows `dx` in full mode, so in a big room you still hear who is on which side.

---

## 5. Walls muffle voices (open floor only)

Example: Riya stands in the lobby, Sam in the kitchen, 40 px apart, with the wall between them. Normal gain 0.65 → muffled `0.65 × 0.3 ≈ 0.20`.

How the browser knows there is a wall:

1. When the map loads, `buildWallGrid(map)` makes one byte per tile from the map's `walls` layer: 1 = wall. Built once, not per frame.
2. Every frame, for each person within 140 px, **only when both of us are on open floor**, `isWallBetween` walks the tiles on the straight line between our two middle points, one tile at a time (a grid traversal, the Amanatides & Woo method: always step into the next tile the line enters, so a thin wall is never skipped). Any wall tile on the way → `blocked: true`. The two people's own tiles don't count, so someone standing in a doorway isn't "behind" it.
3. The world puts `blocked` into the frame; the mixer multiplies by `WALL_MUFFLE_GAIN` (0.3).

Why only on open floor? Inside a private room or the stage hall the server's rules already decide who hears whom (people outside a room hear nothing at all). Muffling is only for open areas, where walls are part of the scenery but don't define a room.

Honest detail: "muffled" here means **quieter**, not filtered. There is no low-pass filter (which would remove high frequencies, like a real wall); the voice is simply at 30 % volume. The People panel shows a "muffled" icon instead of the speaker icon.

Cost: one check takes about 0.3 µs (`wall-ray-test.js`); 8 peers × 60 frames is 480 checks a second, well under 1 ms of work a second.

---

## 6. Smoothing: no clicks, no jumps

If the gain jumped from 0.65 to 0.20 in one step, you would hear a click. So every change glides:

```js
peer.gainNode.gain.setTargetAtTime(targetGain, now, timeConstant);
```

**`setTargetAtTime(target, startTime, timeConstant)`** moves a value towards `target` along an exponential curve. After one time constant it has covered about 63 % of the gap, after three about 95 %.

| Situation | Time constant | ~95 % reached after |
|---|---|---|
| Normal walking (distance changes a little every frame) | 0.05 s | 150 ms |
| A new voice, a mode change (open ↔ room), a wall appears or disappears | 0.1 s (`AUDIO_FADE_MS / 1000 / 3`) | 300 ms (`AUDIO_FADE_MS`) |

The mixer remembers `fadeUntil` per voice: for 300 ms after one of those events it uses the slower constant, then goes back to the normal one. The pan always uses 0.05 s.

Example: Riya and Sam step into Meeting room 2 together. The server sends `changed: full`. Sam's gain glides from 0.65 to 0.77 over about 300 ms instead of jumping.

---

## 7. The Chrome muted-audio trick

```js
// client/src/audio/mixer.js, addPeer
audioElement = document.createElement('audio');
audioElement.muted = true;
audioElement.srcObject = mediaStream;
audioElement.play().catch(() => {});
const sourceNode = ctx.createMediaStreamSource(mediaStream);
```

Why: in Chrome, a remote WebRTC stream does not deliver sound into a Web Audio `MediaStreamSourceNode` unless the stream is also attached to a media element. So each voice gets an `<audio>` element that is **muted**: it makes the stream flow, but produces no sound itself. All the sound you hear comes from the mixer's graph.

Why not just play the `<audio>` element unmuted? It would play every voice at full volume regardless of distance, and the spatial audio would not work. `useVoiceSession.js` says this in its header comment.

On `removePeer` the nodes are disconnected and the element is paused, cleared and removed, so closed voices don't leak memory.

---

## 8. Browsers keep sound off until a click

Browsers don't let a page start sound by itself (**autoplay policy**). A new `AudioContext` starts "suspended" until the user clicks.

1. The "Join office" click in the lobby calls `startAudio()`, which creates the mixer and calls `resume()`: that click is the permission.
2. After a reload of `#/office` there was no click yet. `startAudio` waits at most 1.5 s for `resume()`, then carries on, and the page shows **"Click anywhere to turn on sound"**. The first click calls `resumeSound()`.
3. `mixer.update` does nothing while the context isn't `running`.

---

## 9. The microphone meter (lobby)

`createMicMeter(stream)` connects the microphone to an **AnalyserNode** (a node that reports the sound's frequency content without changing it). `getLevel()` averages the frequency values and scales to 0…1. The lobby draws it as a moving bar so people can check their microphone before joining. It is not connected to the speakers, so you don't hear yourself.

---

## 10. Limits and honest notes

1. **Muffling is volume only**, not a filter.
2. **Pan ignores the vertical**: someone directly above or below is centred.
3. **No reverb or room sound**: a meeting room sounds the same as open floor, just constant.
4. **Code-style note**: `formulas.js` defines its own `EARSHOT_PX = 100` and `DISCONNECT_PX = 140` instead of importing them from `shared/constants.js` (AGENTS.md rule 2). The values match today, but a change in `shared/` would not reach the volume curve. Worth fixing by importing.
