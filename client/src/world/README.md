# client/src/world/ — Module 3, 2D world

**Owner:** Person 3 (Anjali), branch `anjali`.

**Purpose:** everything you see: the office map drawn on a canvas, your character walking with the keyboard at 60 frames a second, other people gliding smoothly, and walls you can't walk through. It sends your position through `net` and gives everyone's positions to the audio mixer every frame (`onFrame`).

**Interface:** `WorldCanvas`, `createFakeNet`, `WorldLab`. See `CONTRACTS.md`, "Client module interfaces".

**Also yours:** `client/public/maps/` (the Tiled map `office.json`) and `client/public/assets/` (character art plus `CREDITS.md`).

**Test page:** `http://localhost:5173/?lab=world`

**Plan:** [`docs/briefs/module-3-world.md`](../../../docs/briefs/module-3-world.md). Start with Task 1.
