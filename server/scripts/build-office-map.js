// server/scripts/build-office-map.js — Person 1
// Builds the Infotact office floor, in the SAME tileset and art style as Anjali's original office.
//
//   input:   client/public/maps/office-base.json   (Anjali's original office: we take its embedded
//                                                   tilesets, so the new map uses exactly her art)
//   outputs: client/public/maps/office.json        (the floor map, Tiled format)
//            server/office/layout.json             (desks, hot desks, neighbourhoods, areas, rooms,
//                                                   elevator, spawn: what the server and the UI need)
//
// Run it (from the repo root):   node server/scripts/build-office-map.js
// Running it again gives exactly the same files.
//
// v6: the whole floor plan is drawn by code (server/scripts/office-map/plan.js): a warm, Gather-like
// office with desk neighbourhoods (pods of 4-8 among plants), meeting rooms of three sizes, phone
// booths, focus rooms, a stage hall, a kitchen with tea tables, a lobby with a coffee bar, and a
// terrace outside. Why code and not Tiled? 100 desks + 14 hot desks + ~60 areas placed by hand would
// be slow and easy to get wrong, and the server needs every desk's and area's exact position. One
// script writes both files, so the map and the data can never disagree.
//
// The map's layers (CONTRACTS.md section 10): floor, rugs, walls, furniture, decor (tiles), collision
// (tiles, invisible), zones (objects: one rectangle per area, with zoneType and name), spawn (one point).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TILE_SIZE } from '../../shared/constants.js';
import { buildOfficePlan, MAP_HEIGHT, MAP_WIDTH } from './office-map/plan.js';

const BASE_PATH = fileURLToPath(new URL('../../client/public/maps/office-base.json', import.meta.url));
const MAP_PATH = fileURLToPath(new URL('../../client/public/maps/office.json', import.meta.url));
const LAYOUT_PATH = fileURLToPath(new URL('../office/layout.json', import.meta.url));

/** One area as a Tiled rectangle object in the "zones" layer. */
function areaToObject(area, id) {
  const [[x1, y1], [x2, y2]] = area.box;
  const properties = [
    { name: 'areaId', type: 'string', value: area.id },
    { name: 'name', type: 'string', value: area.name },
    { name: 'zoneType', type: 'string', value: area.type },
  ];
  if (area.platform) properties.push({ name: 'platform', type: 'string', value: area.platform.flat().join(',') });
  return { id, name: area.name, type: '', x: x1, y: y1, width: x2 - x1, height: y2 - y1, rotation: 0, visible: true, properties };
}

function main() {
  const base = JSON.parse(readFileSync(BASE_PATH, 'utf8'));
  const plan = buildOfficePlan();

  const tileLayers = plan.map.tileLayers();
  const zones = {
    id: tileLayers.length + 1,
    name: 'zones',
    type: 'objectgroup',
    draworder: 'topdown',
    opacity: 1,
    visible: true,
    x: 0,
    y: 0,
    objects: plan.areas.map((area, i) => areaToObject(area, i + 1)),
  };
  const spawn = {
    id: tileLayers.length + 2,
    name: 'spawn',
    type: 'objectgroup',
    draworder: 'topdown',
    opacity: 1,
    visible: true,
    x: 0,
    y: 0,
    objects: [{ id: plan.areas.length + 1, name: 'spawn', type: '', point: true, x: plan.spawn.x, y: plan.spawn.y, width: 0, height: 0, rotation: 0, visible: true }],
  };

  const map = {
    compressionlevel: -1,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: base.tiledversion || '1.10.2',
    version: base.version || '1.10',
    type: 'map',
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    tilesets: base.tilesets, // embedded, exactly Anjali's three LimeZu tilesets
    layers: [...tileLayers, zones, spawn],
    nextlayerid: spawn.id + 1,
    nextobjectid: plan.areas.length + 2,
  };
  const mapText = JSON.stringify(map);
  writeFileSync(MAP_PATH, mapText);

  const layout = {
    note: 'Made by server/scripts/build-office-map.js (plan: server/scripts/office-map/plan.js). Do not edit by hand.',
    map: 'office.json',
    // A short fingerprint of the map: the server stores a new layout version when it changes.
    mapHash: createHash('sha256').update(mapText).digest('hex').slice(0, 16),
    tileSize: TILE_SIZE,
    widthPx: MAP_WIDTH * TILE_SIZE,
    heightPx: MAP_HEIGHT * TILE_SIZE,
    spawn: plan.spawn,
    elevator: plan.elevator,
    wings: plan.wings,
    desks: plan.desks,
    hotDesks: plan.hotDesks,
    rooms: plan.rooms,
    areas: plan.areas,
  };
  writeFileSync(LAYOUT_PATH, `${JSON.stringify(layout, null, 1)}\n`);

  const byType = {};
  for (const area of plan.areas) byType[area.type] = (byType[area.type] || 0) + 1;
  console.log(`[map] wrote client/public/maps/office.json (${MAP_WIDTH} × ${MAP_HEIGHT} tiles, ${(mapText.length / 1024).toFixed(0)} KB)`);
  console.log(
    `[map] wrote server/office/layout.json: ${plan.desks.length} desks in ${plan.wings.length} neighbourhoods, ${plan.hotDesks.length} hot desks, ` +
      `${plan.areas.length} areas (${Object.entries(byType).map(([type, n]) => `${n} ${type}`).join(', ')}), ${plan.rooms.length} labels`,
  );
  console.log('[map] every desk, hot desk and the elevator can be reached on foot from the lobby');
}

main();
