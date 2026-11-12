// server/scripts/wall-ray-test.js — Person 1, v6
// Tests "is there a wall between two people?" (client/src/world/soundWalls.js), the check WorldCanvas
// runs every frame to muffle voices behind walls. It is a plain function, so Node can test it directly:
// first on a tiny made-up grid, then on the real generated office map.
//
// Run it:   node server/scripts/wall-ray-test.js

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { buildWallGrid, isWallBetween } from '../../client/src/world/soundWalls.js';

let failures = 0;
function check(name, passed, detail = '') {
  if (passed) console.log(`[wall-test] PASS  ${name}`);
  else {
    failures += 1;
    console.log(`[wall-test] FAIL  ${name}  ${detail}`);
  }
}

// ---- 1. a made-up 10 × 6 map, 32 px tiles, with a wall column at x = 5 (a door at y = 4) ----
const W = 10;
const H = 6;
const walls = new Array(W * H).fill(0);
for (let y = 0; y < H; y += 1) if (y !== 4) walls[y * W + 5] = 13;
const tiny = buildWallGrid({ width: W, height: H, tileSize: 32, layers: [{ name: 'walls', data: walls }] });
const at = (tx, ty) => [tx * 32 + 16, ty * 32 + 16]; // the middle of a tile

check('1a. same side of the wall → not blocked', !isWallBetween(tiny, ...at(1, 1), ...at(4, 2)));
check('1b. straight across the wall → blocked', isWallBetween(tiny, ...at(3, 1), ...at(7, 1)));
check('1c. diagonally across the wall → blocked', isWallBetween(tiny, ...at(2, 0), ...at(8, 3)));
check('1d. through the door (y = 4) → not blocked', !isWallBetween(tiny, ...at(3, 4), ...at(8, 4)));
check('1e. both directions give the same answer', isWallBetween(tiny, ...at(7, 1), ...at(3, 1)) && !isWallBetween(tiny, ...at(8, 4), ...at(3, 4)));
check('1f. standing in the doorway, talking to someone on the other side → not blocked', !isWallBetween(tiny, ...at(5, 4), ...at(7, 4)));

// ---- 2. the real office map ----
const mapPath = fileURLToPath(new URL('../../client/public/maps/office.json', import.meta.url));
const office = JSON.parse(readFileSync(mapPath, 'utf8'));
const grid = buildWallGrid(office);
const px = (tx, ty) => [tx * 32 + 16, ty * 32 + 16];
check('2a. the map has a walls layer with wall tiles', grid && grid.cells.some((c) => c === 1));
check('2b. two people in the north corridor, 3 tiles apart → not blocked', !isWallBetween(grid, ...px(46, 23), ...px(49, 23)));
check('2c. boardroom (inside) ↔ corridor, through the wall → blocked', isWallBetween(grid, ...px(31, 17), ...px(31, 23)));
check('2d. boardroom ↔ corridor, straight through its open door → not blocked', !isWallBetween(grid, ...px(34, 17), ...px(34, 23)));
check('2e. lobby ↔ kitchen through the wall between them → blocked', isWallBetween(grid, ...px(32, 58), ...px(28, 58)));
check('2f. a neighbourhood ↔ the corridor south of it (no wall) → not blocked', !isWallBetween(grid, ...px(35, 45), ...px(35, 48)));

// ---- 3. it must be cheap: WorldCanvas runs it for every nearby person, every frame ----
const started = performance.now();
const CHECKS = 20000;
for (let i = 0; i < CHECKS; i += 1) isWallBetween(grid, ...px(30 + (i % 40), 22), ...px(33 + (i % 40), 26));
const microseconds = ((performance.now() - started) * 1000) / CHECKS;
check(`3. one check takes ${microseconds.toFixed(2)} µs (8 peers × 60 FPS = 480 checks/s → well under 1 ms a second)`, microseconds < 50);

if (failures > 0) {
  console.log(`[wall-test] ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('[wall-test] all checks passed');
