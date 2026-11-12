// server/scripts/build-office-map.js — Person 1
// Builds the Infotact HQ floor from Anjali's original office map, in the SAME tileset and style.
//
//   input:   client/public/maps/office-base.json   (the original 35 × 25 office, exported from Tiled)
//   outputs: client/public/maps/office.json        (the full floor: original office + 4 desk wings)
//            server/office/layout.json             (desk positions, wings, rooms, elevator, spawn)
//
// Run it (from the repo root):   node server/scripts/build-office-map.js
// Running it again gives exactly the same files (it only reads office-base.json).
//
// Why a script and not hand-editing in Tiled? 100 desks placed by hand would be slow and easy to get
// wrong, and the server needs every desk's exact position too (layout.json). One script writes both,
// so the map and the desk list can never disagree.
//
// The floor plan, in tiles (1 tile = 32 px). The original office stays in the top-left corner, so every
// old position (DEFAULT_SPAWN, the WorldLab bots' start spots) is still in the same place:
//
//   x: 0 ........ 34 35-37 38 ......... 61 ......... 84
//      ┌──────────┐ ┌──┐ ┌────────────┬────────────┐  y 0
//      │ original │ │C │ │  Wing A    │  Wing B    │
//      │ office   │ │o │ │  25 desks  │  25 desks  │
//      │ (lobby,  │ │r │ └────────────┴────────────┘  y 24
//      │ rooms,   │ │r │   corridor                    y 25-27
//      │ hot desks)│ │i │ ┌────────────┬────────────┐  y 28
//      └──────────┘ │d │ │  Wing C    │  Wing D    │
//        (outside)  │o │ │  25 desks  │  25 desks  │
//                   └──┘ └────────────┴────────────┘  y 52

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESKS_PER_WING, TILE_SIZE, WING_IDS, ZONE_TYPES } from '../../shared/constants.js';

const BASE_PATH = fileURLToPath(new URL('../../client/public/maps/office-base.json', import.meta.url));
const MAP_PATH = fileURLToPath(new URL('../../client/public/maps/office.json', import.meta.url));
const LAYOUT_PATH = fileURLToPath(new URL('../office/layout.json', import.meta.url));

// The size of the new map, in tiles.
const MAP_WIDTH = 85;
const MAP_HEIGHT = 53;

// The original office's size (the base map).
const BASE_WIDTH = 35;
const BASE_HEIGHT = 25;

// The plain wooden floor tile used everywhere in the original office.
const FLOOR_TILE = 926;

// Each wing: its outer wall rectangle (tiles, both ends included) and where its doors are.
// A door is a gap in a wall: { side, from, to } (from/to are tile numbers along that wall).
const WINGS = [
  { id: 'A', x1: 38, y1: 0, x2: 61, y2: 24, doors: [{ side: 'left', from: 10, to: 13 }, { side: 'bottom', from: 47, to: 49 }] },
  { id: 'B', x1: 61, y1: 0, x2: 84, y2: 24, doors: [{ side: 'bottom', from: 70, to: 72 }] },
  { id: 'C', x1: 38, y1: 28, x2: 61, y2: 52, doors: [{ side: 'top', from: 47, to: 49 }, { side: 'left', from: 38, to: 40 }] },
  { id: 'D', x1: 61, y1: 28, x2: 84, y2: 52, doors: [{ side: 'top', from: 70, to: 72 }] },
];

// One desk = 3 tiles wide: two rows of desk, then the chair row (copied from the original office,
// base tiles x 2-4, y 15-17). In a wing there are 5 rows of 5 desks: 4 tiles apart in both directions.
const DESK_SOURCE = { x: 2, y: 15, width: 3, height: 3 };
const DESK_CHAIR_OFFSET = { x: 1, y: 2 }; // the chair inside the 3 × 3 desk block
const DESKS_ACROSS = 5;
const DESK_ROWS = 5;
const DESK_STEP_TILES = 4;

// Wall tiles, copied (all layers) from these cells of the original office's bottom-left room.
const WALL_SOURCES = {
  top: { x: 5, y: 14 },
  topLeft: { x: 0, y: 14 },
  topRight: { x: 34, y: 14 },
  left: { x: 0, y: 15 },
  right: { x: 34, y: 15 },
  bottom: { x: 5, y: 24 },
  bottomLeft: { x: 0, y: 24 },
  bottomRight: { x: 34, y: 24 },
};

// The east corridor (tiles, both ends included): a vertical part next to the original office and a
// horizontal part between the top wings and the bottom wings.
const CORRIDOR_VERTICAL = { x1: 35, y1: 1, x2: 37, y2: 51 };
const CORRIDOR_HORIZONTAL = { x1: 35, y1: 25, x2: 83, y2: 27 };

// The elevator: the 3 × 2 tiles at the top of the corridor. Press E there to change floor.
const ELEVATOR_TILES = { x1: 35, y1: 1, x2: 37, y2: 2 };

// Where new people appear: in the lobby (top-left room of the original office).
const SPAWN_TILE = { x: 4, y: 6 };

// Named areas for the top bar ("you are in …"). Tiles, both ends included.
// Desk wings are added automatically below.
const ROOMS = [
  { id: 'lobby', name: 'Lobby', type: ZONE_TYPES.LOBBY, x1: 0, y1: 0, x2: 6, y2: 9 },
  { id: 'meeting-a', name: 'Meeting room', type: ZONE_TYPES.PRIVATE, x1: 8, y1: 1, x2: 20, y2: 8 },
  { id: 'town-hall', name: 'Town hall', type: ZONE_TYPES.STAGE, x1: 26, y1: 1, x2: 33, y2: 8 },
  { id: 'hot-desks', name: 'Hot desks', type: ZONE_TYPES.OPEN, x1: 1, y1: 15, x2: 22, y2: 23 },
  { id: 'focus', name: 'Focus room', type: ZONE_TYPES.SILENT, x1: 24, y1: 15, x2: 33, y2: 18 },
  { id: 'lounge', name: 'Lounge', type: ZONE_TYPES.OPEN, x1: 24, y1: 20, x2: 33, y2: 23 },
  { id: 'elevator', name: 'Elevator', type: ZONE_TYPES.OPEN, x1: 35, y1: 1, x2: 37, y2: 3 },
  { id: 'hallway', name: 'Hallway', type: ZONE_TYPES.OPEN, x1: 0, y1: 10, x2: 34, y2: 13 },
  { id: 'corridor', name: 'Corridor', type: ZONE_TYPES.OPEN, x1: 22, y1: 0, x2: 25, y2: 13 },
  { id: 'east-corridor', name: 'East corridor', type: ZONE_TYPES.OPEN, x1: 35, y1: 0, x2: 37, y2: 52 },
  { id: 'south-corridor', name: 'Corridor', type: ZONE_TYPES.OPEN, x1: 35, y1: 25, x2: 84, y2: 27 },
];

// The part of the new map that is outside the building (below the original office, left of the
// corridor). Nothing is drawn there, so the sky shows; the invisible collision layer blocks it.
const OUTSIDE = { x1: 0, y1: 25, x2: 33, y2: 52 };

// The stage-layer tile id of an office chair in the original map (the hot desks' chairs).
const CHAIR_TILE = 908;
const HOT_DESK_AREA = { x1: 0, y1: 15, x2: 22, y2: 23 };

/** The tile id without Tiled's three flip flags (the top 3 bits). */
function cleanTileId(raw) {
  return raw & 0x1fffffff;
}

/** A tile position → the avatar position that stands on it (x, y = top-left of the avatar). */
function tileToAvatarPx(tileX, tileY) {
  return { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE - 8 };
}

/** Tile rectangle (both ends included) → pixel rectangle { x, y, w, h }. */
function tileRectToPx({ x1, y1, x2, y2 }) {
  return { x: x1 * TILE_SIZE, y: y1 * TILE_SIZE, w: (x2 - x1 + 1) * TILE_SIZE, h: (y2 - y1 + 1) * TILE_SIZE };
}

function main() {
  // The first time, keep the untouched original as office-base.json.
  if (!existsSync(BASE_PATH)) {
    copyFileSync(MAP_PATH, BASE_PATH);
    console.log('[map] saved the original map as client/public/maps/office-base.json');
  }
  const base = JSON.parse(readFileSync(BASE_PATH, 'utf8'));
  if (base.width !== BASE_WIDTH || base.height !== BASE_HEIGHT) {
    throw new Error(`[map] office-base.json should be ${BASE_WIDTH} × ${BASE_HEIGHT} tiles, it is ${base.width} × ${base.height}`);
  }

  // New, empty layers with the same names and order as the original, plus an invisible
  // "collision" layer at the end (blocks the outside area; never drawn because visible is false).
  const layers = base.layers.map((layer) => ({ ...layer, width: MAP_WIDTH, height: MAP_HEIGHT, data: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0) }));
  const collision = {
    ...base.layers[0],
    id: Math.max(...base.layers.map((layer) => layer.id || 0)) + 1,
    name: 'collision',
    visible: false,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    data: new Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
  };
  const byName = Object.fromEntries(layers.map((layer) => [layer.name, layer]));
  const floorLayer = byName.Floor;

  // ---- helpers that write into the new map ----
  const indexOf = (x, y) => y * MAP_WIDTH + x;
  const baseIndexOf = (x, y) => y * BASE_WIDTH + x;

  /** Copy every layer of one original cell to (toX, toY). */
  function copyCell(fromX, fromY, toX, toY) {
    base.layers.forEach((baseLayer, i) => {
      layers[i].data[indexOf(toX, toY)] = baseLayer.data[baseIndexOf(fromX, fromY)];
    });
  }
  /** Empty every layer of one cell, then lay plain floor. */
  function floorCell(x, y) {
    for (const layer of layers) layer.data[indexOf(x, y)] = 0;
    floorLayer.data[indexOf(x, y)] = FLOOR_TILE;
  }
  function wallCell(kind, x, y) {
    const source = WALL_SOURCES[kind];
    copyCell(source.x, source.y, x, y);
  }

  // 1. The original office, unchanged, in the top-left corner.
  for (let y = 0; y < BASE_HEIGHT; y += 1) {
    for (let x = 0; x < BASE_WIDTH; x += 1) {
      copyCell(x, y, x, y);
    }
  }

  // 2. The corridors: plain floor, then walls around them.
  for (const part of [CORRIDOR_VERTICAL, CORRIDOR_HORIZONTAL]) {
    for (let y = part.y1; y <= part.y2; y += 1) {
      for (let x = part.x1; x <= part.x2; x += 1) floorCell(x, y);
    }
  }
  for (let x = 35; x <= 37; x += 1) wallCell('top', x, 0); // top end of the corridor
  for (let y = 25; y <= 51; y += 1) wallCell('left', 34, y); // its left side, below the original office
  wallCell('bottomLeft', 34, 52);
  for (let x = 35; x <= 37; x += 1) wallCell('bottom', x, 52);
  for (let y = 25; y <= 27; y += 1) wallCell('right', 84, y); // the far end of the horizontal part

  // 3. The four wings: floor inside, walls around, doors as gaps, 25 desks each.
  const desks = [];
  const wingsOut = [];
  WINGS.forEach((wing, wingNumber) => {
    for (let y = wing.y1; y <= wing.y2; y += 1) {
      for (let x = wing.x1; x <= wing.x2; x += 1) {
        const top = y === wing.y1;
        const bottom = y === wing.y2;
        const left = x === wing.x1;
        const right = x === wing.x2;
        if (top && left) wallCell('topLeft', x, y);
        else if (top && right) wallCell('topRight', x, y);
        else if (bottom && left) wallCell('bottomLeft', x, y);
        else if (bottom && right) wallCell('bottomRight', x, y);
        else if (top) wallCell('top', x, y);
        else if (bottom) wallCell('bottom', x, y);
        else if (left) wallCell('left', x, y);
        else if (right) wallCell('right', x, y);
        else floorCell(x, y);
      }
    }
    for (const door of wing.doors) {
      for (let along = door.from; along <= door.to; along += 1) {
        if (door.side === 'left') floorCell(wing.x1, along);
        if (door.side === 'right') floorCell(wing.x2, along);
        if (door.side === 'top') floorCell(along, wing.y1);
        if (door.side === 'bottom') floorCell(along, wing.y2);
      }
    }

    // Desks: 5 rows × 5, numbered in a "snake" (row 1 left → right, row 2 right → left, …), so desk
    // n and desk n + 1 are always next to each other. A department block is a run of numbers.
    let number = 1;
    for (let row = 0; row < DESK_ROWS; row += 1) {
      for (let step = 0; step < DESKS_ACROSS; step += 1) {
        const across = row % 2 === 0 ? step : DESKS_ACROSS - 1 - step;
        const blockX = wing.x1 + 2 + across * DESK_STEP_TILES;
        const blockY = wing.y1 + 2 + row * DESK_STEP_TILES;
        for (let dy = 0; dy < DESK_SOURCE.height; dy += 1) {
          for (let dx = 0; dx < DESK_SOURCE.width; dx += 1) {
            copyCell(DESK_SOURCE.x + dx, DESK_SOURCE.y + dy, blockX + dx, blockY + dy);
          }
        }
        const chairX = blockX + DESK_CHAIR_OFFSET.x;
        const chairY = blockY + DESK_CHAIR_OFFSET.y;
        desks.push({
          id: `${wing.id}-${String(number).padStart(2, '0')}`,
          wingId: wing.id,
          index: number - 1,
          row,
          col: across,
          tileX: chairX,
          tileY: chairY,
          // The 3 × 4 tiles this desk "owns" (desk + chair + the aisle row), for department borders.
          area: tileRectToPx({ x1: blockX - 0.5, y1: blockY - 0.5, x2: blockX + 2.5, y2: blockY + 2.5 }),
          ...tileToAvatarPx(chairX, chairY),
        });
        number += 1;
      }
    }
    if (number - 1 !== DESKS_PER_WING) throw new Error(`[map] wing ${wing.id} has ${number - 1} desks, expected ${DESKS_PER_WING}`);

    wingsOut.push({
      id: wing.id,
      tier: wingNumber + 1, // wing A opens at tier 1, B at tier 2, …
      rect: tileRectToPx({ x1: wing.x1 + 1, y1: wing.y1 + 1, x2: wing.x2 - 1, y2: wing.y2 - 1 }), // inside the walls
      outer: tileRectToPx(wing),
    });
  });
  if (WING_IDS.join() !== wingsOut.map((wing) => wing.id).join()) throw new Error('[map] wing ids do not match WING_IDS');

  // 4. The outside area: nothing drawn (sky), but blocked in the collision layer.
  for (let y = OUTSIDE.y1; y <= OUTSIDE.y2; y += 1) {
    for (let x = OUTSIDE.x1; x <= OUTSIDE.x2; x += 1) {
      collision.data[indexOf(x, y)] = 1;
    }
  }

  // 5. Hot desks: the chairs that already exist in the original office's open-desk room.
  const stageLayer = base.layers.find((layer) => layer.name === 'stage');
  const hotDesks = [];
  for (let y = HOT_DESK_AREA.y1; y <= HOT_DESK_AREA.y2; y += 1) {
    for (let x = HOT_DESK_AREA.x1; x <= HOT_DESK_AREA.x2; x += 1) {
      if (cleanTileId(stageLayer.data[baseIndexOf(x, y)]) === CHAIR_TILE) {
        hotDesks.push({ id: `H-${String(hotDesks.length + 1).padStart(2, '0')}`, tileX: x, tileY: y, ...tileToAvatarPx(x, y) });
      }
    }
  }

  // 6. Write the map. Same Tiled format as before (orthogonal, 32 px tiles, embedded tilesets).
  const map = { ...base, width: MAP_WIDTH, height: MAP_HEIGHT, layers: [...layers, collision] };
  map.nextlayerid = collision.id + 1;
  writeFileSync(MAP_PATH, JSON.stringify(map));

  const rooms = [
    ...ROOMS.map(({ x1, y1, x2, y2, ...room }) => ({ ...room, rect: tileRectToPx({ x1, y1, x2, y2 }) })),
    ...wingsOut.map((wing) => ({ id: `wing-${wing.id}`, name: `Wing ${wing.id}`, type: ZONE_TYPES.OPEN, rect: wing.rect })),
  ];
  const layout = {
    note: 'Made by server/scripts/build-office-map.js from client/public/maps/office-base.json. Do not edit by hand.',
    map: 'office.json',
    tileSize: TILE_SIZE,
    widthPx: MAP_WIDTH * TILE_SIZE,
    heightPx: MAP_HEIGHT * TILE_SIZE,
    spawn: tileToAvatarPx(SPAWN_TILE.x, SPAWN_TILE.y),
    elevator: { rect: tileRectToPx(ELEVATOR_TILES), ...tileToAvatarPx(36, 3) },
    wings: wingsOut,
    desks,
    hotDesks,
    rooms,
  };
  writeFileSync(LAYOUT_PATH, `${JSON.stringify(layout, null, 1)}\n`);

  console.log(`[map] wrote client/public/maps/office.json (${MAP_WIDTH} × ${MAP_HEIGHT} tiles)`);
  console.log(`[map] wrote server/office/layout.json: ${desks.length} desks in ${wingsOut.length} wings, ${hotDesks.length} hot desks, ${rooms.length} rooms`);
}

main();
