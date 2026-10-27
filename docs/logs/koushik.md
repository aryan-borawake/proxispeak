# Koushik Varma — Spatial Audio Mixer Daily Log (Module 4)

## Project: ProxiSpeak
**Module:** Spatial Audio Mixer (Module 4)  
**Assigned Folders:** `client/src/audio/`, `client/public/sounds/`  
**Lab URL:** `localhost:5173/?lab=audio`

---

### Day 1: Tasks 1 & 2 — AudioLab and Core Web Audio Graph
- **What I built:**
  - Created `AudioLab.jsx` with an explicit "Click to Enable Audio" button to comply with browser autoplay policies (`AudioContext` suspended until user gesture).
  - Built the core Web Audio processing chain: `MediaStreamSourceNode -> GainNode -> StereoPannerNode -> Destination`.
  - Added manual sliders to test independent volume gain (0.0 to 1.0) and stereo panning (-1.0 to 1.0).
- **Key concepts learned:**
  - Browser audio operates on a connected node graph.
  - `GainNode` acts as our volume control knob.
  - `StereoPannerNode` shifts the balance between left and right speakers.

---

### Day 2: Tasks 3 & 4 — Distance Formula, Panning, and 2D Radar
- **What I built:**
  - Implemented `distanceToGain(distancePx)` in `formulas.js`. Tested linear, quadratic, and smooth cosine falloff. Chose smooth cosine because it avoids abrupt acoustic cutoffs near 0px and rolls off gently to 0.0 at exactly 100px (the Infotact earshot limit).
  - Implemented `dxToPan(dxPx)`. Clamped panning between -0.9 and +0.9 so users never experience total silence in one ear, which causes acoustic fatigue.
  - Built an interactive 2D radar with a central "You" avatar and a draggable peer avatar. Dragging the avatar updates distance, volume, and left/right stereo pan in real time.
- **Viva Note:** Volume calculation happens entirely on the client because it re-evaluates 60 times a second; the server only tells us who is near.

---

### Day 3: Tasks 5, 6 & 7 — Mixer API, Smooth Transitions, and Multi-Peer Simulation
- **What I built:**
  - Built `createMixer()` in `mixer.js` with `addPeer`, `removePeer`, `setMode`, and `update`.
  - Used `gainNode.gain.setTargetAtTime()` and `pannerNode.pan.setTargetAtTime()` with a 50ms time constant. This eliminates popping and clicking sounds caused by sudden volume jumps during fast avatar movement.
  - Added synthetic stream generators to allow testing with pure harmonic frequencies without relying on external mp3 assets.
  - Built the Task 7 multi-peer simulation: Alice (C4), Bob (E4), and Charlie (G4) orbiting at different distances. Verified that all 3 audio streams play concurrently with correct independent volume and stereo panning.
- **Viva Note:** `setTargetAtTime` uses exponential approach to smoothly transition audio parameter values over time, preventing zipper noise.

---

### Day 4 (21 Oct): Task 8 — Mic Level Meter & Audio Controls (Integration #1)
- **What I built:**
  - Implemented `createMicMeter(stream)` in `micMeter.js` using a Web Audio `AnalyserNode` (`fftSize = 256`) to measure real-time microphone RMS volume (0.0 to 1.0).
  - Built `AudioControls.jsx` providing a visual live meter bar that responds when the user talks and a clean mute toggle button.
  - Wired the component into `AudioLab.jsx` with microphone permission handling.
- **Viva Note:** The mute button toggles `track.enabled = false` on the local `MediaStreamTrack`, stopping audio transmission at the source without tearing down the WebRTC connection.

