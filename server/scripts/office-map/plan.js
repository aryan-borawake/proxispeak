// server/scripts/office-map/plan.js — Person 1, v6
// The Infotact floor plan, one function call: buildOfficePlan() paints the whole map with
// MapBuilder and returns the map layers plus everything the server needs to know (desks, hot desks,
// areas, rooms, neighbourhoods, spawn, elevator). Because ONE function makes both, the picture and the
// data can never disagree.
//
// The plan, in tiles (1 tile = 32 px), 110 × 80. Outside the building: a paved terrace with planters,
// a plaza at the front door (south). Inside, three bands:
//
//   y 3-19   STAGE HALL │ Boardroom 10-12 │ Meeting 6-8 │ Meeting 6-8 │ Focus │ Focus │ Room 2-4 │ Room 2-4
//   y 20-24  (hall)     │ corridor ──────────────────────────────────────────────────────────────────
//   y 25-46  (hall) /   │ Neighbourhood A │ B │ C │ D (25 desks each, pods of 6/4/6/4/5) │ Café │ Booths
//            Library lounge
//   y 47-49  corridor ──────────────────────────────────────────────────────────────────────────────────
//   y 50-72  Kitchen + tea tables │ LOBBY (reception, coffee bar, sofa corners, elevator) │ Rooms 2-4 │ Hot desks
//   y 73-79  plaza (front door) and terrace
//
// Every room is an AREA of the right type (CONTRACTS.md section 11): meeting rooms, booths, desk pods,
// tea tables and sofa corners are private; focus rooms silent; the stage hall a stage with a platform;
// corridors, lobby, kitchen, café, lounges and the terrace open.

import { DESKS_PER_WING, TILE_SIZE, WING_IDS, ZONE_TYPES } from '../../../shared/constants.js';
import { MapBuilder } from './builder.js';
import * as T from './tiles.js';

export const MAP_WIDTH = 110;
export const MAP_HEIGHT = 80;

// The building's outer wall (tiles, both ends included).
const BUILDING = { x1: 3, y1: 3, x2: 106, y2: 72 };

// The four desk neighbourhoods (they open in this order as the floor grows: tiers 1-4).
const NEIGHBOURHOODS = [
  { id: 'A', x1: 29, y1: 26 },
  { id: 'B', x1: 45, y1: 26 },
  { id: 'C', x1: 61, y1: 26 },
  { id: 'D', x1: 77, y1: 26 },
];
const NEIGHBOURHOOD_SIZE = { w: 14, h: 21 };

// Where new people appear (the lobby, in front of reception) and the elevator.
const SPAWN_TILE = { x: 51, y: 66 };
const ELEVATOR = { x1: 64, y1: 51, x2: 66, y2: 52, spot: { x: 65, y: 53 } };

/** A tile → the avatar position standing on it (x, y = the avatar's top-left, 8 px above the tile). */
export function tileToAvatarPx(tileX, tileY) {
  return { x: tileX * TILE_SIZE, y: tileY * TILE_SIZE - 8 };
}

/** Tile rectangle (both ends included) → pixel rectangle { x, y, w, h }. */
export function tileRectToPx(x1, y1, x2, y2) {
  return { x: x1 * TILE_SIZE, y: y1 * TILE_SIZE, w: (x2 - x1 + 1) * TILE_SIZE, h: (y2 - y1 + 1) * TILE_SIZE };
}

/** Tile rectangle → an area box [[x1, y1], [x2, y2]] in px, grown by `margin` px on every side. */
function tileBox(x1, y1, x2, y2, margin = 0) {
  return [
    [x1 * TILE_SIZE - margin, y1 * TILE_SIZE - margin],
    [(x2 + 1) * TILE_SIZE + margin, (y2 + 1) * TILE_SIZE + margin],
  ];
}

export function buildOfficePlan() {
  const map = new MapBuilder(MAP_WIDTH, MAP_HEIGHT);
  const closedAreas = []; // private / silent / stage: listed first, so they win over the open ones around them
  const openAreas = [];
  const rooms = []; // named places for the labels and the top bar

  /** Register an area (and optionally a label). */
  function area(id, name, type, box, extra = {}) {
    const record = { id, name, type, box, ...extra };
    if (type === ZONE_TYPES.PRIVATE || type === ZONE_TYPES.SILENT || type === ZONE_TYPES.STAGE) closedAreas.push(record);
    else openAreas.push(record);
    return record;
  }
  function label(id, name, type, x1, y1, x2, y2) {
    rooms.push({ id, name, type, rect: tileRectToPx(x1, y1, x2, y2) });
  }

  /** A walled room: floor, walls, face colour, an area over its inside, a label. */
  function room({ id, name, type, x1, y1, x2, y2, floor, face, labelled = true }) {
    map.floor(x1 + 1, y1 + 1, x2 - 1, y2 - 1, T.FLOORS[floor]);
    map.roomWalls(x1, y1, x2, y2);
    map.faceStyle(x1 + 1, y1 + 1, x2 - 1, y2 - 1, face);
    const record = area(id, name, type, tileBox(x1 + 1, y1 + 1, x2 - 1, y2 - 1));
    if (labelled) label(id, name, type, x1 + 1, y1 + 1, x2 - 1, y2 - 1);
    return record;
  }

  // ---------------------------------------------------------------- outside and the building shell
  map.floor(0, 0, MAP_WIDTH - 1, MAP_HEIGHT - 1, T.FLOORS.brick);
  map.floor(BUILDING.x1 + 1, BUILDING.y1 + 1, BUILDING.x2 - 1, BUILDING.y2 - 1, T.FLOORS.stripeWood);
  map.roomWalls(BUILDING.x1, BUILDING.y1, BUILDING.x2, BUILDING.y2);
  map.faceStyle(0, BUILDING.y2 + 1, MAP_WIDTH - 1, MAP_HEIGHT - 1, 'grey'); // the front of the building, seen from the plaza
  map.faceStyle(BUILDING.x1 + 1, BUILDING.y1 + 1, BUILDING.x2 - 1, BUILDING.y2 - 1, 'salmon'); // corridors: Anjali's wall colour

  // ---------------------------------------------------------------- north band
  const hall = room({ id: 'stage-hall', name: 'Stage hall', type: ZONE_TYPES.STAGE, x1: 3, y1: 3, x2: 27, y2: 31, floor: 'redWood', face: 'cream' });
  hall.platform = tileBox(8, 6, 22, 10);
  map.floor(8, 6, 22, 10, T.FLOORS.brownWood);
  map.door(27, 22, 27, 24); // to the corridor
  map.door(13, 31, 16, 31); // to the library lounge
  map.stamp(T.TV, 14, 4);
  map.stamp(T.CURTAIN_WINDOW, 6, 4);
  map.stamp(T.CURTAIN_WINDOW, 22, 4);
  map.stamp(T.RUG_RED, 13, 7);
  map.stamp(T.CHALKBOARD, 10, 7); // the speaker's board
  map.stamp(T.FLOOR_LAMP, 8, 6);
  map.stamp(T.FLOOR_LAMP, 22, 6);
  for (let y = 13; y <= 27; y += 2) {
    for (let x = 6; x <= 24; x += 1) {
      if (x >= 14 && x <= 16) continue; // the aisle
      map.tile('furniture', x, y, T.AUDIENCE_CHAIRS[x % T.AUDIENCE_CHAIRS.length]);
    }
  }
  map.stamp(T.PALM, 4, 27);
  map.stamp(T.PALM, 25, 27);
  map.stamp(T.PLANT, 4, 6);
  map.stamp(T.PLANT, 26, 6);

  room({ id: 'boardroom', name: 'Boardroom (10-12)', type: ZONE_TYPES.PRIVATE, x1: 27, y1: 3, x2: 43, y2: 19, floor: 'brownWood', face: 'beige' });
  map.door(33, 19, 36, 19);
  map.stamp(T.TV, 34, 4);
  map.stamp(T.WINDOW, 29, 4);
  map.stamp(T.WINDOW, 39, 4);
  whiteTable(map, 31, 10, 7); // 5 seats on each long side + 2 ends = 12
  map.stamp(T.TREE, 28, 15);
  map.stamp(T.TREE, 41, 15);
  map.stamp(T.STAND_PLANT, 28, 6);
  map.stamp(T.STAND_PLANT, 42, 6);

  room({ id: 'meeting-2', name: 'Meeting room 2 (6-8)', type: ZONE_TYPES.PRIVATE, x1: 43, y1: 3, x2: 55, y2: 19, floor: 'greyWood', face: 'mint' });
  map.door(48, 19, 50, 19);
  map.stamp(T.TV, 48, 4);
  map.stamp(T.WINDOW, 45, 4);
  map.stamp(T.CORKBOARD, 51, 4);
  whiteTable(map, 47, 10, 5);
  map.stamp(T.PLANT, 44, 15);
  map.stamp(T.PLANT, 54, 15);
  map.stamp(T.FLOOR_LAMP, 54, 6);

  room({ id: 'meeting-3', name: 'Meeting room 3 (6-8)', type: ZONE_TYPES.PRIVATE, x1: 55, y1: 3, x2: 67, y2: 19, floor: 'orangeWood', face: 'salmon' });
  map.door(60, 19, 62, 19);
  map.stamp(T.TV, 60, 4);
  map.stamp(T.RED_WINDOW, 57, 4);
  map.stamp(T.WORLD_MAP, 63, 4);
  whiteTable(map, 59, 10, 5);
  map.stamp(T.PLANT, 56, 15);
  map.stamp(T.PLANT, 66, 15);
  map.stamp(T.FLOOR_LAMP, 56, 6);

  for (const [index, x1] of [67, 76].entries()) {
    const number = index + 1;
    room({ id: `focus-${number}`, name: `Focus room ${number}`, type: ZONE_TYPES.SILENT, x1, y1: 3, x2: x1 + 9, y2: 19, floor: 'carpet', face: 'grey' });
    map.door(x1 + 4, 19, x1 + 5, 19);
    map.stamp(T.BOOKCASE, x1 + 1, 4);
    map.stamp(T.WINDOW, x1 + 5, 4);
    for (const [dx, dy] of [[2, 9], [6, 9], [2, 14], [6, 14]]) {
      map.stamp(T.WOOD_DESK, x1 + dx, dy);
      map.tile('furniture', x1 + dx, dy + 2, T.CHAIR_UP);
    }
    map.stamp(T.PLANT, x1 + 8, 6);
  }

  room({ id: 'meeting-4', name: 'Meeting room 4 (2-4)', type: ZONE_TYPES.PRIVATE, x1: 85, y1: 3, x2: 95, y2: 19, floor: 'beigeWood', face: 'brown' });
  map.door(89, 19, 91, 19);
  map.stamp(T.TV, 89, 4);
  map.stamp(T.WINDOW, 86, 4);
  sofaCorner(map, 87, 9, T.SOFA_LIGHT, T.RUG_RED);
  map.stamp(T.CHALKBOARD, 89, 15);
  map.stamp(T.PLANT, 86, 15);
  map.stamp(T.PLANT, 94, 15);

  room({ id: 'meeting-5', name: 'Meeting room 5 (2-4)', type: ZONE_TYPES.PRIVATE, x1: 95, y1: 3, x2: 106, y2: 19, floor: 'beigeWood', face: 'orange' });
  map.door(100, 19, 102, 19);
  map.stamp(T.WORLD_MAP, 100, 4);
  map.stamp(T.WINDOW, 97, 4);
  map.stamp(T.WINDOW, 103, 4);
  whiteTable(map, 99, 10, 3);
  map.stamp(T.TREE, 96, 15);
  map.stamp(T.STAND_PLANT, 105, 15);

  // ---------------------------------------------------------------- the corridors (open)
  area('corridor-north', 'Corridor', ZONE_TYPES.OPEN, tileBox(28, 20, 105, 24));
  area('corridor-south', 'Corridor', ZONE_TYPES.OPEN, tileBox(4, 47, 105, 49));
  label('corridor-north', 'Corridor', ZONE_TYPES.OPEN, 28, 20, 105, 24);

  // ---------------------------------------------------------------- the library lounge (open, west)
  map.floor(4, 32, 26, 46, T.FLOORS.carpetDark);
  map.faceStyle(4, 32, 26, 33, 'brown');
  area('library-lounge', 'Library lounge', ZONE_TYPES.OPEN, tileBox(4, 32, 26, 46));
  label('library-lounge', 'Library lounge', ZONE_TYPES.OPEN, 4, 32, 26, 46);
  for (const x of [5, 7, 9]) map.stamp(T.BOOKCASE, x, 32);
  map.stamp(T.AQUARIUM, 19, 32);
  map.stamp(T.WINDOW, 23, 32);
  sofaCorner(map, 5, 38, T.SOFA_BROWN, T.RUG_BLUE, { id: 'lounge-corner-1', name: 'Lounge sofa corner 1', area });
  sofaCorner(map, 17, 39, T.SOFA_GREY, T.RUG_RED, { id: 'lounge-corner-2', name: 'Lounge sofa corner 2', area });
  map.stamp(T.TREE, 24, 35);
  map.stamp(T.FLOOR_LAMP, 13, 38);
  map.stamp(T.STAND_PLANT, 4, 44);
  map.stamp(T.STAND_PLANT, 26, 44);

  // ---------------------------------------------------------------- desk neighbourhoods
  const desks = [];
  const wings = [];
  NEIGHBOURHOODS.forEach((hood, wingNumber) => {
    const x2 = hood.x1 + NEIGHBOURHOOD_SIZE.w - 1;
    const y2 = hood.y1 + NEIGHBOURHOOD_SIZE.h - 1;
    // Warm wood, alternating, so each neighbourhood has its own look.
    map.floor(hood.x1, hood.y1, x2, y2, wingNumber % 2 === 0 ? T.FLOORS.orangeWood : T.FLOORS.brownWood);
    area(`neighbourhood-${hood.id}`, `Neighbourhood ${hood.id}`, ZONE_TYPES.OPEN, tileBox(hood.x1, hood.y1, x2, y2));
    label(`neighbourhood-${hood.id}`, `Neighbourhood ${hood.id}`, ZONE_TYPES.OPEN, hood.x1, hood.y1, x2, y2);
    const hoodDesks = neighbourhoodDesks(map, hood, area);
    if (hoodDesks.length !== DESKS_PER_WING) throw new Error(`[map] neighbourhood ${hood.id} has ${hoodDesks.length} desks, expected ${DESKS_PER_WING}`);
    desks.push(...hoodDesks);
    const rect = tileRectToPx(hood.x1, hood.y1, x2, y2);
    wings.push({ id: hood.id, name: `Neighbourhood ${hood.id}`, tier: wingNumber + 1, rect, outer: rect });
  });
  if (WING_IDS.join() !== wings.map((wing) => wing.id).join()) throw new Error('[map] neighbourhood ids do not match WING_IDS');

  // ---------------------------------------------------------------- café and phone booths (east)
  map.floor(92, 25, 99, 46, T.FLOORS.cream);
  area('cafe', 'Café', ZONE_TYPES.OPEN, tileBox(92, 25, 99, 46));
  label('cafe', 'Café', ZONE_TYPES.OPEN, 92, 25, 99, 46);
  [29, 35, 41].forEach((ty, i) => teaTable(map, 95, ty, { id: `cafe-table-${i + 1}`, name: `Café table ${i + 1}`, area }));
  map.stamp(T.PALM, 92, 26);
  map.stamp(T.STAND_PLANT, 92, 33);
  map.stamp(T.STAND_PLANT, 92, 39);
  map.stamp(T.PLANT, 92, 45);

  for (let k = 0; k < 4; k += 1) {
    const top = 25 + k * 5;
    room({ id: `booth-${k + 1}`, name: `Phone booth ${k + 1}`, type: ZONE_TYPES.PRIVATE, x1: 100, y1: top, x2: 106, y2: top + 5, floor: 'mint', face: 'cream', labelled: false });
    map.door(100, top + 3, 100, top + 4);
    map.stamp(T.ARMCHAIR, 103, top + 3);
    map.stamp(T.PICTURE, 102, top + 1);
    map.stamp(T.STAND_PLANT, 105, top + 3);
    label(`booth-${k + 1}`, `Booth ${k + 1}`, ZONE_TYPES.PRIVATE, 101, top + 1, 105, top + 4);
  }

  // ---------------------------------------------------------------- south band
  room({ id: 'kitchen', name: 'Kitchen', type: ZONE_TYPES.OPEN, x1: 3, y1: 50, x2: 30, y2: 72, floor: 'tealTile', face: 'cream' });
  map.door(14, 50, 17, 50);
  map.door(30, 62, 30, 64);
  map.stamp(T.BAR_SHELVES, 5, 51);
  map.stamp(T.FRIDGE, 11, 51);
  map.stamp(T.WINE_SHELVES, 19, 51);
  map.stamp(T.STOVES, 19, 53);
  map.stamp(T.DISPLAY_FRIDGES, 24, 53);
  counterWithStools(map, 5, 54, 5);
  [[7, 59], [14, 59], [21, 59], [7, 66], [14, 66], [21, 66]].forEach(([tx, ty], i) => teaTable(map, tx, ty, { id: `tea-table-${i + 1}`, name: `Tea table ${i + 1}`, area }));
  map.stamp(T.PALM, 4, 68);
  map.stamp(T.PALM, 27, 68);
  map.stamp(T.STAND_PLANT, 28, 57);

  room({ id: 'lobby', name: 'Lobby', type: ZONE_TYPES.LOBBY, x1: 30, y1: 50, x2: 73, y2: 72, floor: 'beigeWood', face: 'beige' });
  map.door(45, 50, 58, 50); // wide open to the corridor
  map.door(49, BUILDING.y2, 54, BUILDING.y2); // the front door, onto the plaza
  map.door(73, 56, 73, 57); // to meeting room 6
  map.door(73, 67, 73, 68); // to meeting room 7
  map.stamp(T.BAR_SHELVES, 32, 51); // the coffee bar
  counterWithStools(map, 32, 54, 6);
  map.stamp(T.WORLD_MAP, 39, 51);
  map.stamp(T.CORKBOARD, 42, 51);
  map.stamp(T.WINDOW, 60, 51);
  map.stamp(T.AQUARIUM, 68, 51);
  map.stamp(T.PICTURE, 71, 51);
  map.stamp(T.RECEPTION, 49, 61); // Anjali's reception desk, now facing the front door
  map.stamp(T.RECEPTION_ITEMS, 49, 61);
  map.tile('furniture', 51, 60, T.CHAIR_DOWN);
  map.stamp(T.PLANT, 47, 60);
  map.stamp(T.PLANT, 55, 60);
  map.stamp(T.RUG_RED, 50, 63);
  map.stamp(T.RUG_GREEN, 49, 69);
  map.stamp(T.RUG_GREEN, 52, 69);
  sofaCorner(map, 33, 60, T.SOFA_LIGHT, T.RUG_OLIVE, { id: 'lobby-corner-1', name: 'Lobby sofa corner 1', area });
  sofaCorner(map, 60, 62, T.SOFA_WHITE, T.RUG_BLUE, { id: 'lobby-corner-2', name: 'Lobby sofa corner 2', area });
  map.stamp(T.TREE, 31, 68);
  map.stamp(T.TREE, 71, 68);
  map.stamp(T.TREE, 43, 56);
  map.stamp(T.TREE, 59, 56);
  map.stamp(T.FLOOR_LAMP, 40, 60);
  // A waiting area facing reception (open: anyone passing can join in), and plants by the front door.
  map.stamp(T.SOFA_GREY, 44, 64);
  map.stamp(T.COFFEE_TABLE, 44, 66);
  map.stamp(T.SOFA_GREY, 56, 64);
  map.stamp(T.COFFEE_TABLE, 57, 66);
  map.stamp(T.PALM, 46, 69);
  map.stamp(T.PALM, 56, 69);
  for (const x of [33, 40, 63, 70]) map.stamp(T.STAND_PLANT, x, 69);
  map.stamp(T.RED_LAMP, 31, 57);
  map.stamp(T.BLUE_LAMP, 72, 57);

  room({ id: 'meeting-6', name: 'Meeting room 6 (2-4)', type: ZONE_TYPES.PRIVATE, x1: 73, y1: 50, x2: 85, y2: 61, floor: 'greyWood', face: 'mint' });
  map.stamp(T.TV, 78, 51);
  whiteTable(map, 78, 56, 3);
  map.stamp(T.PLANT, 84, 58);
  map.stamp(T.STAND_PLANT, 75, 53);

  room({ id: 'meeting-7', name: 'Meeting room 7 (2-4)', type: ZONE_TYPES.PRIVATE, x1: 73, y1: 61, x2: 85, y2: 72, floor: 'greyWood', face: 'red' });
  map.stamp(T.WINDOW, 80, 62);
  sofaCorner(map, 76, 65, T.SOFA_GREY, T.RUG_OLIVE);
  map.stamp(T.PLANT, 84, 69);

  room({ id: 'hot-desks', name: 'Hot desks', type: ZONE_TYPES.OPEN, x1: 85, y1: 50, x2: 106, y2: 72, floor: 'orangeWood', face: 'salmon' });
  map.door(92, 50, 95, 50);
  map.stamp(T.WINDOW, 87, 51);
  map.stamp(T.WINDOW, 98, 51);
  map.stamp(T.POSTER, 102, 51);
  const hotDesks = [
    ...podDesks(map, { x: 88, y: 55, perSide: 4, id: 'hot-pod-1', name: 'Hot desk pod 1', area }),
    ...podDesks(map, { x: 88, y: 63, perSide: 3, id: 'hot-pod-2', name: 'Hot desk pod 2', area }),
  ].map((seat, i) => ({ id: `H-${String(i + 1).padStart(2, '0')}`, tileX: seat.tileX, tileY: seat.tileY, ...tileToAvatarPx(seat.tileX, seat.tileY) }));
  sofaCorner(map, 98, 60, T.SOFA_BROWN, T.RUG_GREEN, { id: 'hot-corner', name: 'Hot desk sofa corner', area });
  map.stamp(T.PALM, 103, 68);
  map.stamp(T.PLANT, 97, 69);

  // ---------------------------------------------------------------- the plaza and terrace (open, outside)
  // The aisles between the neighbourhoods are corridor too (listed late, so every room wins over it).
  area('corridor-middle', 'Corridor', ZONE_TYPES.OPEN, tileBox(28, 25, 99, 46));
  // Outside: four strips around the building (an area can't have a hole, so not one big box).
  area('terrace-north', 'Garden terrace', ZONE_TYPES.OPEN, tileBox(0, 0, MAP_WIDTH - 1, BUILDING.y1 - 1));
  area('terrace-south', 'Garden terrace', ZONE_TYPES.OPEN, tileBox(0, BUILDING.y2 + 1, MAP_WIDTH - 1, MAP_HEIGHT - 1));
  area('terrace-west', 'Garden terrace', ZONE_TYPES.OPEN, tileBox(0, BUILDING.y1, BUILDING.x1 - 1, BUILDING.y2));
  area('terrace-east', 'Garden terrace', ZONE_TYPES.OPEN, tileBox(BUILDING.x2 + 1, BUILDING.y1, MAP_WIDTH - 1, BUILDING.y2));
  label('terrace', 'Garden terrace', ZONE_TYPES.OPEN, 40, BUILDING.y2 + 3, 63, MAP_HEIGHT - 1);
  for (let x = 5; x < MAP_WIDTH - 5; x += 8) {
    map.stamp(T.TREE, x, 0);
    map.stamp(T.STAND_PLANT, x + 4, 0);
  }
  for (let y = 5; y < BUILDING.y2; y += 6) {
    map.stamp(T.STAND_PLANT, 0, y);
    map.stamp(T.STAND_PLANT, MAP_WIDTH - 1, y);
  }
  map.stamp(T.TREE, 0, 0);
  map.stamp(T.TREE, MAP_WIDTH - 2, 0);
  for (const x of [6, 22, 38, 64, 80, 96]) map.stamp(T.TREE, x, 77);
  map.stamp(T.PALM, 0, 76);
  map.stamp(T.PALM, MAP_WIDTH - 2, 76);
  teaTable(map, 13, 76, null);
  teaTable(map, 88, 76, null);
  map.stamp(T.SOFA_WHITE, 29, 76);
  map.stamp(T.SOFA_WHITE, 72, 76);

  // ---------------------------------------------------------------- finish
  map.finishWalls();
  const spawn = tileToAvatarPx(SPAWN_TILE.x, SPAWN_TILE.y);
  const elevator = { rect: tileRectToPx(ELEVATOR.x1, ELEVATOR.y1, ELEVATOR.x2, ELEVATOR.y2), ...tileToAvatarPx(ELEVATOR.spot.x, ELEVATOR.spot.y) };
  const areas = [...closedAreas, ...openAreas];
  checkReachable(map, SPAWN_TILE, [
    ...desks.map((d) => ({ x: d.tileX, y: d.tileY, what: `desk ${d.id}` })),
    ...hotDesks.map((d) => ({ x: d.tileX, y: d.tileY, what: `hot desk ${d.id}` })),
    { ...ELEVATOR.spot, what: 'the elevator spot' },
  ]);
  return { map, desks, hotDesks, wings, areas, rooms, spawn, elevator };
}

// ====================================================================== furniture groups

/**
 * Anjali's white meeting table (the same tiles as her original meeting room), `length` tiles long,
 * with chairs on both long sides and one at each end. Seats: 2 × (length − 2) + 2.
 * Example: length 5 → 3 + 3 + 2 = 8 seats.
 */
function whiteTable(map, x, y, length) {
  const columns = [];
  for (let i = 0; i < length; i += 1) {
    if (i === 0) columns.push([520, 521, 522]);
    else if (i === length - 1) columns.push([472, 473, 474]);
    else if (i === length - 2) columns.push([488, 489, 490]);
    else columns.push([504, 505, 506]);
  }
  columns.forEach((column, i) => {
    column.forEach((gid, dy) => map.tile('furniture', x + i, y + dy, T.rot90(gid), true));
    if (i > 0 && i < length - 1) {
      map.tile('furniture', x + i, y - 1, T.CHAIR_DOWN);
      map.tile('furniture', x + i, y + 3, T.CHAIR_UP);
    }
  });
  // One chair at each end (the left end chair stands beside the table, the right one at its rounded end).
  map.tile('furniture', x - 1, y + 1, T.SIDE_CHAIR_RIGHT);
  map.tile('furniture', x + length, y + 1, T.SIDE_CHAIR_LEFT);
}

/**
 * A sofa corner (Gather's "sofa nook"): a rug, a sofa at the back, a side sofa left and right and a
 * coffee table, 7 × 4 tiles. With `privateArea`, it is a private area (sit down and talk privately).
 */
function sofaCorner(map, x, y, sofa, rug, privateArea = null) {
  map.stamp(rug, x + 2, y);
  map.stamp(sofa, x + 2, y);
  map.stamp(T.SOFA_SIDE_FACING_RIGHT, x, y + 1);
  map.stamp(T.SOFA_SIDE_FACING_LEFT, x + 5, y + 1);
  map.stamp(T.COFFEE_TABLE, x + 3, y + 2);
  map.stamp(T.COFFEE_TABLE_ITEMS, x + 3, y + 2);
  if (privateArea) privateArea.area(privateArea.id, privateArea.name, ZONE_TYPES.PRIVATE, tileBox(x, y, x + 6, y + 3, 6));
}

/** A round tea table for four (two chairs above, two below), optionally a private area. */
function teaTable(map, x, y, privateArea) {
  map.stamp(T.ROUND_TABLE, x, y);
  map.tile('furniture', x, y - 1, T.CHAIR_DOWN);
  map.tile('furniture', x + 1, y - 1, T.CHAIR_DOWN);
  map.tile('furniture', x, y + 2, T.CHAIR_UP);
  map.tile('furniture', x + 1, y + 2, T.CHAIR_UP);
  if (privateArea) privateArea.area(privateArea.id, privateArea.name, ZONE_TYPES.PRIVATE, tileBox(x - 1, y - 1, x + 2, y + 2, 6));
}

/** A white counter with bar stools in front of it (coffee bar). */
function counterWithStools(map, x, y, length) {
  for (let i = 0; i < length; i += 1) {
    const gid = i === 0 ? 520 : i === length - 1 ? 522 : 521;
    map.tile('furniture', x + i, y, gid, true);
    map.tile('furniture', x + i, y + 1, T.BAR_STOOLS[i % 3]);
  }
}

/**
 * One two-sided desk pod at (x, y): `perSide` desks facing `perSide` desks, chairs outside.
 *   row y      chairs of the north side (sitting faces down)
 *   rows y+1-2 north desks, turned round (their fronts face north)
 *   rows y+3-4 south desks
 *   row y+5    chairs of the south side (sitting faces up)
 * Returns the seats in "snake" order (north side left → right, then south side right → left), so
 * seat n and n + 1 are always neighbours.
 */
function podDesks(map, { x, y, perSide, id, name, area }) {
  const seats = [];
  for (let i = 0; i < perSide; i += 1) {
    const dx = x + i * 2;
    map.tile('furniture', dx, y + 1, T.rot180(T.DESK_FRONT[1]), true);
    map.tile('furniture', dx + 1, y + 1, T.rot180(T.DESK_FRONT[0]), true);
    map.tile('furniture', dx, y + 2, T.rot180(T.DESK_TOP[1]), true);
    map.tile('furniture', dx + 1, y + 2, T.rot180(T.DESK_TOP[0]), true);
    map.tile('furniture', dx, y + 3, T.DESK_TOP[0], true);
    map.tile('furniture', dx + 1, y + 3, T.DESK_TOP[1], true);
    map.tile('furniture', dx, y + 4, T.DESK_FRONT[0], true);
    map.tile('furniture', dx + 1, y + 4, T.DESK_FRONT[1], true);
    map.tile('furniture', dx, y, T.CHAIR_DOWN);
    map.tile('furniture', dx + 1, y + 5, T.CHAIR_UP);
  }
  for (let i = 0; i < perSide; i += 1) seats.push({ tileX: x + i * 2, tileY: y, side: 'north' });
  for (let i = perSide - 1; i >= 0; i -= 1) seats.push({ tileX: x + i * 2 + 1, tileY: y + 5, side: 'south' });
  if (area) area(id, name, ZONE_TYPES.PRIVATE, tileBox(x, y, x + perSide * 2 - 1, y + 5, 12));
  return seats;
}

/**
 * The 25 desks of one neighbourhood, laid out as five pods, and numbered on a 5 × 5 "logical" grid
 * (row, col) in a snake so desk n and n + 1 are always neighbours (the desk rule relies on it):
 *   rows 0-1  pod 1 (cols 0-2, 6 desks) and pod 2 (cols 3-4, 4 desks), facing each other
 *   rows 2-3  pod 3 (6 desks) and pod 4 (4 desks)
 *   row 4     pod 5: one row of 5 desks facing up
 * Each pod is a private area ("Pod A1" …): sit down with your team and talk.
 */
function neighbourhoodDesks(map, hood, area) {
  const ox = hood.x1 + 1;
  const oy = hood.y1 + 1;
  // Physical tile x of a desk's left tile, by logical column (pods 1/3 = cols 0-2, pods 2/4 = cols 3-4).
  const podX = (col) => (col < 3 ? ox + col * 2 : ox + 8 + (col - 3) * 2);
  const rowTop = [oy, oy, oy + 8, oy + 8];

  // Draw the pods (and their areas).
  podDesks(map, { x: ox, y: oy, perSide: 3, id: `pod-${hood.id}1`, name: `Pod ${hood.id}1`, area });
  podDesks(map, { x: ox + 8, y: oy, perSide: 2, id: `pod-${hood.id}2`, name: `Pod ${hood.id}2`, area });
  podDesks(map, { x: ox, y: oy + 8, perSide: 3, id: `pod-${hood.id}3`, name: `Pod ${hood.id}3`, area });
  podDesks(map, { x: ox + 8, y: oy + 8, perSide: 2, id: `pod-${hood.id}4`, name: `Pod ${hood.id}4`, area });
  const rowFiveY = oy + 16;
  for (let col = 0; col < 5; col += 1) {
    const dx = ox + 1 + col * 2;
    map.tile('furniture', dx, rowFiveY, T.DESK_TOP[0], true);
    map.tile('furniture', dx + 1, rowFiveY, T.DESK_TOP[1], true);
    map.tile('furniture', dx, rowFiveY + 1, T.DESK_FRONT[0], true);
    map.tile('furniture', dx + 1, rowFiveY + 1, T.DESK_FRONT[1], true);
    map.tile('furniture', dx + 1, rowFiveY + 2, T.CHAIR_UP);
  }
  area(`pod-${hood.id}5`, `Pod ${hood.id}5`, ZONE_TYPES.PRIVATE, tileBox(ox + 1, rowFiveY, ox + 10, rowFiveY + 2, 12));

  // Plants between the pods, so it feels like a neighbourhood, not a factory floor.
  map.stamp(T.TREE, ox + 6, oy + 2);
  map.stamp(T.TREE, ox + 6, oy + 10);
  map.stamp(T.STAND_PLANT, hood.x1, rowFiveY);
  map.stamp(T.STAND_PLANT, hood.x1 + NEIGHBOURHOOD_SIZE.w - 1, rowFiveY);

  // The 25 desks in snake order on the logical grid.
  const desks = [];
  let number = 1;
  for (let row = 0; row < 5; row += 1) {
    for (let step = 0; step < 5; step += 1) {
      const col = row % 2 === 0 ? step : 4 - step;
      let tileX;
      let tileY;
      let deskArea;
      if (row === 4) {
        tileX = ox + 1 + col * 2 + 1;
        tileY = rowFiveY + 2;
        deskArea = tileRectToPx(ox + 1 + col * 2, rowFiveY, ox + 2 + col * 2, rowFiveY + 2);
      } else if (row % 2 === 0) {
        // north side of a pod: the chair is above the desk
        tileX = podX(col);
        tileY = rowTop[row];
        deskArea = tileRectToPx(tileX, tileY, tileX + 1, tileY + 2);
      } else {
        // south side: the chair is below, on the desk's right tile
        tileX = podX(col) + 1;
        tileY = rowTop[row] + 5;
        deskArea = tileRectToPx(podX(col), rowTop[row] + 3, podX(col) + 1, rowTop[row] + 5);
      }
      desks.push({
        id: `${hood.id}-${String(number).padStart(2, '0')}`,
        wingId: hood.id,
        index: number - 1,
        row,
        col,
        pod: row === 4 ? `pod-${hood.id}5` : `pod-${hood.id}${(row < 2 ? 1 : 3) + (col < 3 ? 0 : 1)}`,
        tileX,
        tileY,
        area: deskArea,
        ...tileToAvatarPx(tileX, tileY),
      });
      number += 1;
    }
  }
  return desks;
}

/**
 * Safety check: can you walk from the spawn point to every desk, hot desk and the elevator?
 * A "flood fill": start at the spawn tile, keep stepping to free neighbouring tiles, see what you reach.
 * Throws with a clear message if something can't be reached (e.g. a plant blocks a door).
 */
function checkReachable(map, start, targets) {
  const reached = new Set();
  const queue = [[start.x, start.y]];
  const free = (x, y) => map.inside(x, y) && map.collision[map.index(x, y)] === 0;
  if (!free(start.x, start.y)) throw new Error(`[map] the spawn tile (${start.x}, ${start.y}) is blocked`);
  reached.add(map.index(start.x, start.y));
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (free(nx, ny) && !reached.has(map.index(nx, ny))) {
        reached.add(map.index(nx, ny));
        queue.push([nx, ny]);
      }
    }
  }
  const missing = targets.filter((t) => !reached.has(map.index(t.x, t.y)));
  if (missing.length > 0) {
    throw new Error(`[map] can't walk from the lobby to: ${missing.slice(0, 8).map((t) => `${t.what} (${t.x}, ${t.y})`).join(', ')}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''}`);
  }
  map.reachable = reached;
}
