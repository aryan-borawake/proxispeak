# Module 4 — Spatial Audio Mixer

**For: Person 4.** Owner: ________

> **How to read this brief.** Sections 1–5 explain your module. Section 6 is your plan: read each task on the day the calendar gives it, not all at once. The appendix at the end is written for your AI tool, so you can skip it.

---

## 1. What this module does

Your module makes the office **sound** real: people get louder as you walk up to them, and you hear them in the ear on their side.

**Example.** Your colleague stands 30 pixels to your right. Their voice passes through two "knobs" before it reaches your headphones:

- the **volume knob** is turned up high, because 30 px is close,
- the **left/right knob** is turned towards the right.

**voice → volume knob → left/right knob → speakers**

As they walk away, you turn the volume knob down, until it reaches zero at 100 pixels. If they walk round to your left, the left/right knob swings to the left. You re-set both knobs every frame (60 times a second), so the change is smooth.

You never deal with the server or with setting up voice connections. You receive voices and positions, and you control how they sound.

---

## 2. Where your module fits

1. **Person 1's** WebRTC code receives each nearby person's voice and hands it to **your** mixer.
2. **Person 3's** world gives **your** mixer everyone's positions every frame.
3. Your mixer turns the knobs and plays the result through the speakers.

Person 1 connects these in `App.jsx` in Week 3. Until then, you use sample sounds and a fake character.

---

## 3. Your folders

| Folder or file | What goes in it |
|---|---|
| `client/src/audio/AudioLab.jsx` | Your test page (open `localhost:5173/?lab=audio`) |
| `client/src/audio/formulas.js` | The two formulas: distance → volume, direction → left/right |
| `client/src/audio/mixer.js` | The mixer that handles many voices at once |
| `client/src/audio/micMeter.js`, `AudioControls.jsx` | A bar showing how loud your microphone is, and a mute button |
| `client/src/audio/index.js` | The list of functions other modules may use |
| `client/public/sounds/` | Free sample sounds, plus `CREDITS.md` saying where each came from |

**Not yours:** everything else, including `App.jsx` (Person 1) and `shared/`.

---

## 4. Words you need

| Word | Plain meaning |
|---|---|
| Web Audio API | The browser's built-in sound toolkit |
| `AudioContext` | The one object that runs all sound processing on the page |
| Suspended | Silent and paused. Browsers start the `AudioContext` suspended until the user clicks something (a rule to stop pages blasting sound) |
| Resume | Wake up a suspended `AudioContext`, after a click |
| Node | One sound-processing step, like one knob |
| Chain / connect | Plugging nodes one after another, like guitar pedals: `voice.connect(volume)` |
| Destination | The end of every chain: your speakers or headphones |
| `GainNode` | The volume knob. **Gain** is the audio word for volume: 1 = normal, 0.5 = half, 0 = silent |
| `StereoPannerNode` | The left/right knob. **Pan** -1 = fully left ear, 0 = both ears equally, 1 = fully right ear |
| Sample sound | A short audio file used for testing, e.g. someone talking or music |
| Slider | A draggable bar on the page, used here to turn a knob by hand |
| Formula | A small calculation, e.g. "volume = 1 − distance ÷ 100" |
| Curve | How volume falls with distance: a straight line, or a gentler curve |
| Clamp | Keep a number inside limits, e.g. never below -1 or above 1 |
| MediaStream | Live audio, like a microphone or a voice coming over WebRTC |
| `MediaStreamAudioSourceNode` | Turns a MediaStream into the first node of a chain |
| `createMediaStreamDestination()` | Turns a chain's output into a MediaStream. You use it to make sample files look exactly like real voices |
| Mixer | Your code that holds one chain per voice and sets all their knobs |
| Peer | Another person whose voice you're receiving |
| `setTargetAtTime` | Turns a knob smoothly over a few milliseconds. Jumping straight to a new value makes a click |
| `AnalyserNode` | Measures how loud a sound is right now. Used for the mic level bar |
| Mute | Stop sending your microphone sound |
| Muted `<audio>` element | A hidden, silent audio player. Chrome needs one attached to each incoming voice before Web Audio can use it (a known Chrome quirk) |
| Memory leak | Old nodes that stay in memory after a person leaves, slowly making the page heavier |
| Disconnect | Unplug a node from its chain so it can be thrown away |
| Frame | One redraw of the screen (60 a second). Person 3 sends you positions once per frame |
| Mode | How a voice is treated: `falloff` = quieter with distance, `full` = full volume (inside a private room) |
| `BiquadFilterNode` (lowpass) | A filter that cuts high sounds, so a voice sounds muffled, like through a wall |
| `PannerNode` / HRTF | A more advanced 3D sound node; HRTF is a mode that imitates how real ears hear direction |
| Headphones | Use them when testing, or your speakers feed back into your mic and cause echo |

---

## 5. Working alone

You never need the server or WebRTC until Week 3:

- **Your test page** (`?lab=audio`) plays a sample sound as a "fake person". You drag a dot around a "you" dot and hear the volume and ears change.
- **Making sample files look like real voices:** play the sample into `createMediaStreamDestination()`. What comes out is a MediaStream, exactly the kind of thing WebRTC will hand you later. So when real voices arrive, your mixer already works with them.

---

## 6. Your two weeks

**Commit messages.** The word before the colon says what kind of change it is: `feat` = new feature, `fix` = bug fix, `docs` = documentation. The word in brackets is your module. Example: `feat(audio): mixer API`.

**Integration days** (Wed 21 and Sat 24 Oct): open a pull request from your branch into `dev` in the morning. Sat 17 Oct is a setup check: your branch exists and your work runs on your laptop.

### Calendar

Tasks are numbered. This calendar says which day to do each one. If the plan slips again, only this table changes.

| Date | Do these tasks | Notes |
|---|---|---|
| Fri 16 Oct | 1, 2 | Create your branch from `main`; start your log |
| Sat 17 Oct | 3 | Setup check |
| Sun 18 Oct | 4 |  |
| Mon 19 Oct | 5 |  |
| Tue 20 Oct | 6, 7 |  |
| Wed 21 Oct | 8 | **Integration #1:** pull request into `dev` in the morning |
| Thu 22 Oct | 9, 10 |  |
| Fri 23 Oct | 11 |  |
| Sat 24 Oct | 12 | **Integration #2 + mid freeze:** pull request in the morning |
| Sun 25 Oct | 13 |  |
| Mon 26 Oct | 14 |  |

### Task by task

**Task 1: a page that plays a sound.**
- Build: `AudioLab.jsx` with a Start button. Clicking it creates the `AudioContext` and plays a sample sound. Create your log.
- Why: browsers only allow sound after a click, so the button is needed.
- Done when: clicking Start plays the sound at `?lab=audio`.
- Commit: `feat(audio): audio lab page`

**Task 2: the two knobs.**
- Build: the chain sample → `GainNode` → `StereoPannerNode` → speakers. Add two sliders, one for volume and one for left/right.
- Why: this chain is the core of your module.
- Done when: moving the sliders changes the volume and the ear.
- Commit: `feat(audio): gain and pan chain`

**Task 3: distance → volume.**
- Build: `distanceToGain(distance)`. Try two or three curves (a straight line, a gentler curve). Print a table of volumes for 0 to 140 px. Pick the one that sounds most natural, and write why in your log. The volume must be 0 at 100 px and beyond.
- Why: this formula decides how the whole app feels.
- Commit: `feat(audio): distance to volume formula`

**Task 4: direction → left/right, and a fake person.**
- Build: `dxToPan(dx)`, where dx is how far right (positive) or left (negative) the other person is. Clamp it between -1 and 1; maybe never go fully to one ear. On your test page, draw a "you" dot and a draggable "fake person" dot. As you drag, the knobs follow.
- Done when: dragging the dot around you changes volume and ear smoothly.
- Commit: `feat(audio): direction to pan and draggable fake person`

**Task 5: the first mixer.**
- Build: `createMixer()` with `addPeer` (add a voice), `removePeer` (remove one) and `update` (set every voice's knobs from positions).
- Why: the mixer is what other modules will actually use.
- Commit: `feat(audio): mixer API`

**Task 6: smooth changes, and live streams.**
- Build: change knobs with `setTargetAtTime` so there are no clicks. Feed your sample files into the mixer as MediaStreams, using `createMediaStreamDestination()`.
- Why: real voices will arrive as MediaStreams, so test with the same thing now.
- Commit: `feat(audio): smooth gain and stream input`

**Task 7: three people at once.**
- Build: three sample sounds as three fake people, walking in circles at different distances.
- Done when: you can hear all three, each at the right volume and ear.
- Commit: `feat(audio): multi-peer test`

**Task 8: mic level bar and mute button.**
- Build: `createMicMeter(stream)` uses an `AnalyserNode` to measure how loud your microphone is. `AudioControls.jsx` shows a bar that moves when you talk, plus a mute button. The button calls a function it is given (`onToggleMute`); Person 1's code does the actual muting.
- Commit: `feat(audio): mic meter and controls`

**Task 9: the Chrome quirk.**
- Build: inside `addPeer`, also attach each incoming stream to a hidden, muted `<audio>` element. Chrome won't pass real WebRTC voices into Web Audio without it.
- Why: without this, real voices are silent in Chrome, and we'd only find out in Week 3.
- Commit: `fix(audio): Chrome remote stream workaround`

**Task 10: "click to enable sound".**
- Build: a clear "Click to enable sound" step and a `resume()` function. If the `AudioContext` is ever suspended, show the button again.
- Why: in the real app, users will otherwise hear nothing and think it's broken.
- Commit: `feat(audio): audio unlock flow`

**Task 11: Person 3's position format, plus modes.**
- Build: drive your test page with exactly the position format Person 3's `onFrame` gives (see the appendix). Copy the format; don't import their code yet. Add `setMode`: in `full` mode, ignore distance and play at full volume.
- Why: when Person 1 connects you in Week 3, it just works.
- Commit: `feat(audio): frame-driven updates and modes`

**Task 12: clean up properly (mid freeze).**
- Build: make sure `removePeer` disconnects every node. Add and remove 50 fake people and check the page doesn't get heavier (no memory leak). From now until the review, only fixes.
- Commit: `fix(audio): node cleanup`

**Task 13: explain it.**
- Build: `docs/audio.md`: how your module works, in your own words, with your formula and why you chose it.
- Commit: `docs: audio module explanation`

**Task 14: rehearsal.**
- Build: run the demo with the team. Write viva notes in your log.
- Commit: `docs: viva notes`

---

## 7. Mid review: what you show

On your test page, drag the fake person around you: louder when near, quieter when far, silent beyond 100 px, and moving between your left and right ears. Bonus: three fake people at once.

---

## 8. Weeks 3–4

**Week 3: real voices and walls**
- Person 1 connects real voices and Person 3's positions to your mixer. Test with 3–4 real browser tabs (headphones!).
- Walls: when Person 3 says a wall is between two people, lower the volume and add a lowpass filter so the voice sounds muffled.
- Use `full` mode for people in the same private room.

**Week 4: polish**
- Try a `PannerNode` with HRTF and compare it with your left/right knob.
- Add a "who's near" list with a small live volume bar per person.
- Silent zone: mute everyone. Tune the distance curve together with the team.

---

## 9. Final review: what you show

Real colleagues' voices that get louder as you walk up, move between your ears, sound muffled through walls, and follow the zone rules.

---

## 10. Viva questions, with short answers to build on

| Question | Short answer |
|---|---|
| Why does the `AudioContext` start suspended? | Browsers block sound until the user clicks, so pages can't blast audio unexpectedly |
| What do gain and pan values mean? | Gain 1 = normal, 0 = silent. Pan -1 = left ear, 0 = both, 1 = right ear |
| Why `setTargetAtTime` instead of setting the value directly? | Jumping straight to a new volume makes an audible click; a smooth change doesn't |
| Why the muted `<audio>` element? | A known Chrome quirk: remote WebRTC audio only reaches Web Audio if it's also attached to an audio element |
| How does your formula turn distance into volume? | Explain your chosen curve, with numbers: e.g. 20 px → loud, 90 px → faint, 100 px → silent |
| Why calculate volume in the browser, not on the server? | It changes every frame (60 times a second); the server only decides who connects |

---

## 11. Mistakes to avoid

- Always test the microphone with headphones, or you'll get echo and feedback.
- Create **one** `AudioContext` for the whole app, never one per voice.
- Disconnect every node when a person leaves.
- Clamp pan values to -1..1 yourself, so your numbers are honest.
- Don't set `gain.value` directly every frame; use `setTargetAtTime`.

---

## Appendix: for your AI tool

The exact names live in `CONTRACTS.md`. This is a summary.

```js
// client/src/audio/index.js
export function distanceToGain(distancePx) {}  // 0..1; 0 at or beyond EARSHOT_PX (100)
export function dxToPan(dxPx) {}               // -1..1; negative = speaker is to the left

export function createMixer() {
  return {
    resume: async () => {},            // call after a user click
    addPeer: (id, mediaStream) => {},  // also attach stream to a muted <audio> (Chrome quirk)
    removePeer: (id) => {},            // disconnect every node
    setMode: (id, mode) => {},         // 'falloff' (default) or 'full'
    update: (frame) => {},             // called every frame with WorldCanvas onFrame data
  };
}

export function createMicMeter(stream) {}      // → { getLevel(): 0..1, stop() }
export function AudioControls({ micStream, muted, onToggleMute }) {}
export function AudioLab() {}                  // test page component (?lab=audio)

// frame = { self: { id, x, y }, others: [{ id, x, y, blocked }] }
// Example: self at (300, 200), u2 at (330, 200) → 30 px to the right → gain high (~0.85), pan ~+0.3
```
