# client/src/audio/ — Module 4, Spatial audio

**Owner:** Person 4 (Koushik), branch `koushik`.

**Purpose:** makes the office sound real. Each voice goes through a volume knob (louder when close, silent at 100 px) and a left/right knob (heard in the ear on the speaker's side), updated every frame. Also the mic level bar and the mute button.

**Interface:** `distanceToGain`, `dxToPan`, `createMixer`, `createMicMeter`, `AudioControls`, `AudioLab`. See `CONTRACTS.md`, "Client module interfaces".

**Also yours:** `client/public/sounds/` (sample sounds plus `CREDITS.md`).

**Test page:** `http://localhost:5173/?lab=audio`

**Plan:** [`docs/briefs/module-4-audio.md`](../../../docs/briefs/module-4-audio.md). Start with Task 1.
