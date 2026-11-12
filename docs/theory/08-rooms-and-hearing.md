# 08 — Rooms and the hearing rules

*Code: `server/geo/canHear.js` (the rules, pure functions), `server/signaling/tick.js` (applies them every 250 ms), `server/geo/areas.js` (`locateUsers`, `$geoWithin`), `server/signaling/areaChat.js`, `server/signaling/roomAreas.js`; browser: `client/src/world/areas.js`, `officeOverlay.js` (`drawAreaFocus`), `client/src/app/AreaChat.jsx`, `OfficePage.jsx`. Tests: `server/scripts/room-rules-test.js` (31 checks), `area-test.js` (12 checks with robots).*

---

## 1. Areas and their types

An **area** is a part of the map with a hearing type. It is plain data:

```js
{ id: 'meeting-2', floorId: 'floor-1', name: 'Meeting room 2 (6-8)', type: 'private', box: [[1408, 128], [1760, 608]] }
{ id: 'stage-hall', name: 'Stage hall', type: 'stage', box: [[128, 128], [864, 992]], platform: [[256, 192], [736, 352]] }
```

- `box` is `[[x1, y1], [x2, y2]]`: top-left and bottom-right corners in pixels. An area may instead have a `polygon`.
- Coordinates are measured at the avatar's **middle** (`AVATAR_MIDDLE`: 12 px right, 16 px down from its top-left), the same point everywhere: in the browser, in the server's memory check and (shifted) in MongoDB.
- A stage hall also has a `platform` box: the stage itself.
- Standing in no area at all counts as open floor.

| Type (`ZONE_TYPES`) | Feels like | On the generated floor | Count |
|---|---|---|---|
| `open` | normal office floor: hear people near you | corridors, kitchen, café, library lounge, hot-desk room, the 4 neighbourhoods, terraces | 15 |
| `lobby` | same as open | the lobby (spawn, elevator) | 1 |
| `private` | a closed room: everyone inside hears everyone inside | Boardroom, meeting rooms 2–7, 4 phone booths, 20 desk pods, 2 hot-desk pods + a hot-desk corner, 3 café tables, 6 tea tables, 4 sofa corners | 47 |
| `silent` | a focus room: nobody hears anybody | Focus rooms 1 and 2 | 2 |
| `stage` | a hall: the person on the platform reaches everyone in it | Stage hall | 1 |

66 areas in total (`server/office/layout.json`). Each is also a rectangle in the map's `zones` object layer, so an uploaded Tiled map carries its own areas.

Labs and robot tests (`DEFAULT_ROOM`, `{ name }` joins) have **no** areas: everybody there is on open floor.

---

## 2. The rules: `canHear(listener, speaker)`

`canHear` answers "can this listener hear this speaker, and how?" It is **directional** (the stage is not symmetric) and **pure** (only its inputs; no database), so every rule is tested on its own.

Each person is `{ x, y, status, area, onPlatform }`. The rules are checked **in this order**; the first that matches decides:

| # | Situation | Audible? | Mode |
|---|---|---|---|
| 1 | Listener **or** speaker is on Do Not Disturb | no | — |
| 2 | Listener **or** speaker is in a `silent` area | no | — |
| 3 | Both in the **same** `private` area | yes, any distance | `full` |
| 4a | Both in the **same** `stage` hall, speaker **on the platform** | yes, any distance | `full` |
| 4b | Both in the same stage hall, speaker in the audience | by distance (as open floor) | `falloff` |
| 5 | **Different** areas, and either one is `private` or `stage` | no | — |
| 6 | Otherwise (both on open floor: no area, `open` or `lobby`, even different ones) | yes if distance ≤ 100 px (≤ 140 px if already connected) | `falloff` |

```js
// server/geo/canHear.js (shortened)
if (listener.status === STATUSES.DND || speaker.status === STATUSES.DND) return SILENCE;           // 1
if (listenerArea?.type === ZONE_TYPES.SILENT || speakerArea?.type === ZONE_TYPES.SILENT) return SILENCE; // 2
if (sameArea && listenerArea.type === ZONE_TYPES.PRIVATE) return { audible: true, mode: FULL };    // 3
if (sameArea && listenerArea.type === ZONE_TYPES.STAGE) {                                          // 4
  if (speaker.onPlatform) return { audible: true, mode: FULL };
  return byDistance(listener, speaker, connected);
}
if (!sameArea && (isClosedArea(listenerArea) || isClosedArea(speakerArea))) return SILENCE;        // 5
return byDistance(listener, speaker, connected);                                                   // 6
```

The **mode** tells the listener's mixer how to play the voice: `full` = a constant volume (0.77), `falloff` = quieter with distance, silent at 100 px (see `05-audio.md`).

### Connecting is "either way"

A WebRTC connection carries sound both ways. So the tick connects two people when **either** can hear the other:

```js
export function shouldConnect(a, b, options) {
  return canHear(a, b, options).audible || canHear(b, a, options).audible;
}
```

Each side then gets its own mode for the other (`peerModes` in the tick). If one side "can't hear" the other, its mixer gets `falloff`, and at that distance the volume formula gives 0.

### Where the tick gets `area` and `onPlatform`

Every 250 ms, for each floor with movers, `locateUsers` (one MongoDB aggregate with one `$geoWithin` per area and one for the platform) writes `area` and `onPlatform` on every player of the floor. Without MongoDB, `areaAt` and `isOnPlatform` do the same in memory. See `04-mongodb-geo.md`.

The tick's candidates for each mover are: people within 140 px, their current peers, **and** everyone in the same private area or stage hall at any distance. That last group is how two people 450 px apart in a big room still connect.

---

## 3. Worked example 1: a meeting room

Meeting room 2 is `[[1408, 128], [1760, 608]]` (352 × 480 px), type `private`.

- Riya's middle is at (1440, 200), inside.
- Sam's middle is at (1720, 560), inside. Distance √(280² + 360²) ≈ 456 px.
- Lee's middle is at (1720, 640): the corridor just south of the room's wall, 80 px from Sam.

| Pair | Rule that decides | Result |
|---|---|---|
| Riya ↔ Sam | 3: same private area | audible both ways, `full` |
| Lee → Sam (Lee listening) | 5: different areas, Sam's is private | not audible |
| Sam → Lee | 5 | not audible |
| Lee ↔ Riya | 5 | not audible |

What happens:

1. On the tick after they walk in, `locateUsers` puts Riya and Sam in `meeting-2`.
2. If they were already connected (they walked in together), both get `peers:update { changed: [{ id, mode: 'full' }] }`; the mixer fades each to 0.77 over 300 ms. If not, they get `entered` with `full`, although 456 px is far beyond earshot.
3. Lee is 80 px from Sam, within open-floor earshot, but rule 5 refuses: no connection at all.
4. Riya walks out into the corridor. Next tick: different areas, one private → not audible → `left`. Her voice fades out of Sam's speakers.

`area-test.js` does this with robots in the Boardroom: two inside 639 px apart → connected `full`; one outside 54 px from someone inside → connected to nobody inside; walking out → disconnected; then side by side on open floor → connected `falloff`.

---

## 4. Worked example 2: the stage hall

Stage hall `[[128, 128], [864, 992]]`, platform `[[256, 192], [736, 352]]`.

- Arjun's middle is at (496, 272): on the platform.
- Riya's middle is at (496, 800): in the audience, 528 px from Arjun.
- Neha's middle is at (546, 800): next to Riya, 50 px away.

| Listener ← Speaker | Rule | Result |
|---|---|---|
| Riya ← Arjun | 4a: speaker on the platform | `full` |
| Arjun ← Riya | 4b: Riya isn't on the platform; 528 px > 100 | not audible |
| Riya ← Neha | 4b: 50 px ≤ 100 | `falloff` |
| Neha ← Arjun | 4a | `full` |
| someone in the corridor ← Arjun | 5: different areas, the hall is a stage | not audible |

So Riya–Arjun **are connected** (Riya needs to hear him: `shouldConnect` is true), Riya's mixer plays Arjun at 0.77, and Arjun's mixer has Riya in `falloff` mode at 528 px → volume 0. That's "receive-only" in practice: the audience hears the speaker, the speaker hears only the people right in front of the stage.

If Neha steps onto the platform, the next tick sends Riya `changed: [{ id: Neha, mode: 'full' }]`: two speakers on the platform are both heard by the whole hall (and by each other at `full`).

**The limit**: each person has at most 8 connections (`MAX_PEERS`). Arjun's links to the audience rank as "only the other person needs it" (`RANK_ONLY_FOR_THE_OTHER + distance`), and each audience member ranks Arjun as `full` (top). So the 8 audience members nearest to Arjun hear him; the 9th does not. A real auditorium needs a media server (SFU) that receives the voice once and forwards it to many. Not built.

---

## 5. Worked example 3: silence, Do Not Disturb and walls

- **Focus room.** Sam is inside Focus room 1 (`silent`), Riya is in the corridor 20 px from him. Rule 2: not audible. Two people side by side inside the focus room: rule 2 again. `area-test.js`: two robots 20 px apart in Focus room 1 never connect. The page shows a SILENT badge and a note that microphones are off.
- **Do Not Disturb.** Riya turns on DND in a meeting room with Sam. The server hangs up all her connections at once (`disconnectAllPeers`), and rule 1 keeps her out of every peer set. `busy` is only a label: rule 1 checks `dnd` only.
- **A wall on open floor.** Riya in the lobby, Sam in the kitchen, 40 px apart, a wall between. Both are on open floor (lobby and kitchen are `lobby` / `open`), so rule 6: audible, `falloff`, connected. The **browser** then finds a wall tile on the line between them and plays Sam at 30 % (`WALL_MUFFLE_GAIN`). The server's rules don't know about walls; walls only matter where areas don't already decide.
- **Hysteresis on open floor.** Connected at 90 px, they drift to 130 px: still connected (≤ 140). At 150 px: `left`.

---

## 6. Desk pods are private areas

Every desk pod is a `private` area. So two people seated in the same pod hear each other at `full`, and someone walking down the neighbourhood next to the pod hears nothing from it (rule 5).

Consequence in the demo: Riya (A-01), Arjun (A-02), Neha (A-03) and Design's Ananya (A-09) and Vikram (A-10) share pod-A1, while Kabir (A-04) and Sneha (A-05), also Engineering, are in pod-A2 and can't hear Riya from their desks. Department blocks follow the snake numbering, which crosses pods (see `07-office-model.md`, section 3).

---

## 7. The highlight

When I'm inside a private, silent or stage area, the rest of the map is dimmed:

1. Every frame, the browser finds my area with its own copy of the rule (`client/src/world/areas.js`, `areaAt` at the avatar's middle).
2. If the area is closed (private, silent, stage), `drawAreaFocus` draws a dark film over the whole map with the area cut out and a light outline around it.
3. When my area changes, `onAreaChange(area)` tells the page: the top bar shows the area name and a PRIVATE / SILENT / STAGE badge, and the right panel switches from People to the area chat. Leaving shows People again.

This is **display only**. Who hears whom and who gets a chat message is decided on the server.

The People panel's "Nearby" list shows everyone in my room (any distance) and anyone I can hear, with a speaker icon (or a "muffled" icon behind a wall).

---

## 8. Area chat

Like Gather: a text chat for the room you stand in.

1. The browser sends `chat:send { text }`. It does **not** say which room; the server never trusts the browser for that.
2. The server checks the text: trimmed, 1 to 500 characters (`CHAT_MAX_CHARS`), else `BAD_CHAT`.
3. It finds the sender's area **from the position it holds**, in memory: `areaAt(getRoomAreas(floorId), x, y)`. No database query per message.
4. Open floor (no area, `open`, `lobby`) → `BAD_CHAT` "area chat works inside a room". Private, silent and stage areas have a chat (a focus room is silent for voice, but you can still type).
5. It sends `chat:message { areaId, areaName, from: { id, name }, text, t }` to every player on the floor whose position is in the **same** area right now, the sender included.

Example: Riya and Sam in Meeting room 2, Lee in the corridor. Riya sends "Shall we start?" → Riya and Sam get it, Lee gets nothing.

Nothing is stored: someone who walks in later sees no older messages.

Known limits:
1. **Two sources for "which area"**: hearing uses the tick's stored areas via MongoDB every 250 ms; chat uses the same areas in memory at send time. At a doorway they can disagree for up to one tick.
2. **No rate limit** on chat messages.
3. **DND people still see and send area chat** (DND is about voice).
