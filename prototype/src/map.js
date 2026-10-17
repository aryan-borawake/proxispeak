// ---------------------------------------------------------------------------
// THE MAP
// ---------------------------------------------------------------------------
// The office is a grid of square "tiles", like a chess board.
// Each tile is 32 x 32 pixels. The grid is 25 tiles wide and 18 tiles tall,
// so the whole map is 800 x 576 pixels.
//
// The map is just a JSON array of rows. Each number says what is on that tile:
//   0 = floor         (you can walk here)
//   1 = wall          (blocks movement)
//   2 = desk / table  (blocks movement)
//   3 = meeting room floor (you can walk here, drawn as blue carpet)
// ---------------------------------------------------------------------------

export const TILE_SIZE = 32
export const MAP_COLS = 25
export const MAP_ROWS = 18
export const MAP_WIDTH = MAP_COLS * TILE_SIZE // 800 px
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE // 576 px

export const TILE = {
  FLOOR: 0,
  WALL: 1,
  DESK: 2,
  MEETING: 3,
}

// prettier-ignore
export const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,1],
  [1,0,0,2,2,2,0,0,2,2,2,0,0,0,0,1,3,3,2,2,2,2,3,3,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,2,2,2,2,3,3,1],
  [1,0,0,2,2,2,0,0,2,2,2,0,0,0,0,1,3,3,3,3,3,3,3,3,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,3,3,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,2,2,2,0,0,2,2,2,0,0,0,0,2,2,2,0,0,2,2,2,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,2,2,2,0,0,2,2,2,0,0,0,0,2,2,2,0,0,2,2,2,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]

// Where the meeting room is (used only to draw its label).
export const MEETING_ROOM = { col: 16, row: 1, cols: 8, rows: 6 }

// Where your avatar appears after you click "Join" (centre of tile col 6, row 14).
export const SPAWN_POINT = tileCenter(6, 14)

// Pixel position of the centre of a tile.
export function tileCenter(col, row) {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 }
}

// What is at this tile? Anything outside the map counts as a wall.
export function tileAt(col, row) {
  if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return TILE.WALL
  return MAP[row][col]
}

// "Solid" tiles are the ones you cannot walk through.
export function isSolid(tileType) {
  return tileType === TILE.WALL || tileType === TILE.DESK
}
