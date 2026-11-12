// client/src/world/soundWalls.js — Person 3's world module, v6 (added by Person 1)
// "Is there a wall between me and that person?" — the spec's Week 4 rule: walls block sound.
// On open floor a voice behind a wall plays muffled (WALL_MUFFLE_GAIN, about 30 %). Inside a private
// room or the stage hall the server's room rules decide instead, so this is only used for open floor.
//
// Why a grid? The map is made of 32 px tiles, and a tile either is a wall or isn't. So we keep one
// number per tile (1 = wall), built ONCE when the map loads, and then a check only visits the few tiles
// on the straight line between two people: cheap enough to do for every nearby person, every frame.
//
// How the line is walked: the "grid traversal" (Amanatides & Woo) steps from tile to tile exactly
// along the line, always into the next tile the line enters, so it never skips a thin wall.
// Example: me at tile (10, 5), them at tile (14, 5), wall tiles at x = 12 → tiles 10, 11, 12 ← wall → blocked.
//
// This file has no imports, so the robot tests (Node) can use it as it is.

// Floor tiles that old maps put on their "walls" layer by mistake (the same two map.js ignores).
const FLOOR_TILE_IDS = new Set([926, 192]);

/**
 * Build the wall grid from a loaded map (loadOfficeMap or the raw Tiled JSON).
 * @param {{ width: number, height: number, tileSize?: number, tilewidth?: number, layers: Array }} map
 * @returns {{ width: number, height: number, tileSize: number, cells: Uint8Array } | null}
 */
export function buildWallGrid(map) {
  if (!map || !Array.isArray(map.layers)) return null;
  const tileSize = map.tileSize || map.tilewidth;
  const cells = new Uint8Array(map.width * map.height);
  for (const layer of map.layers) {
    if ((layer.name || '').toLowerCase() !== 'walls' || !Array.isArray(layer.data)) continue;
    layer.data.forEach((raw, index) => {
      const id = raw & 0x1fffffff;
      if (id > 0 && !FLOOR_TILE_IDS.has(id)) cells[index] = 1;
    });
  }
  return { width: map.width, height: map.height, tileSize, cells };
}

/** Is the tile (tx, ty) a wall? Outside the map counts as no wall. */
function isWallTile(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return false;
  return grid.cells[ty * grid.width + tx] === 1;
}

/**
 * Is there a wall tile on the straight line from point A to point B (map px)?
 * The tiles A and B stand on themselves don't count (someone standing in a doorway is not "behind" it).
 * @returns {boolean}
 */
export function isWallBetween(grid, ax, ay, bx, by) {
  if (!grid) return false;
  const size = grid.tileSize;
  let tx = Math.floor(ax / size);
  let ty = Math.floor(ay / size);
  const endX = Math.floor(bx / size);
  const endY = Math.floor(by / size);
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  // How far along the line (0 = A, 1 = B) we must go to cross one whole tile, in x and in y.
  const tDeltaX = dx !== 0 ? Math.abs(size / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(size / dy) : Infinity;
  // How far along the line the FIRST tile border is, in x and in y.
  const nextBorderX = dx > 0 ? (tx + 1) * size : tx * size;
  const nextBorderY = dy > 0 ? (ty + 1) * size : ty * size;
  let tMaxX = dx !== 0 ? Math.abs((nextBorderX - ax) / dx) : Infinity;
  let tMaxY = dy !== 0 ? Math.abs((nextBorderY - ay) / dy) : Infinity;

  // At most (tiles across + tiles down) steps; the guard stops a bad input looping forever.
  const maxSteps = Math.abs(endX - tx) + Math.abs(endY - ty) + 2;
  for (let step = 0; step < maxSteps; step += 1) {
    if (tx === endX && ty === endY) return false;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (tx === endX && ty === endY) return false;
    if (isWallTile(grid, tx, ty)) return true;
  }
  return false;
}
