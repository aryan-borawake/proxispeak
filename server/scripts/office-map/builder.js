// server/scripts/office-map/builder.js — Person 1, v6
// A tiny "paint program" for the office map, used by plan.js. It keeps one array per map layer and
// knows how to paint floors, walls (with their visible faces), stamps (furniture) and blocked tiles.
//
// Layers, drawn in this order (CONTRACTS.md section 10):
//   floor      every walkable surface
//   rugs       rugs and mats (walkable)
//   walls      wall tops (dark) and wall faces (the visible side). Blocks walking AND sound (stage 4).
//   furniture  desks, tables, sofas, chairs, plants
//   decor      things on tables and on walls (monitors, shelves, windows, pictures)
//   collision  invisible: 1 = you can't walk here (furniture, walls, the map edge)
//
// Walls: a wall is one tile thick and drawn as a dark top, like Gather. Wherever a wall has open floor
// directly SOUTH of it, the two tiles below get the wall's face (we look at the map from the south,
// so we see that side). The face colour comes from the room the face is in (faceStyleAt).

import { FACES, WALL_TOP } from './tiles.js';

export const LAYER_NAMES = ['floor', 'rugs', 'walls', 'furniture', 'decor'];

export class MapBuilder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.layers = Object.fromEntries(LAYER_NAMES.map((name) => [name, new Array(width * height).fill(0)]));
    this.collision = new Array(width * height).fill(0);
    this.isWall = new Array(width * height).fill(false); // wall tops only (faces are added in finish)
    this.faceStyles = []; // [{ rect, style }]: which face colour to use where (first match wins)
    this.doorCells = new Set(); // door openings: never covered by a wall face
  }

  index(x, y) {
    return y * this.width + x;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Put one tile on one layer. */
  set(layerName, x, y, gid) {
    if (!this.inside(x, y)) throw new Error(`[map] (${x}, ${y}) is outside the ${this.width} × ${this.height} map`);
    this.layers[layerName][this.index(x, y)] = gid;
  }

  /** You can't walk on (x, y). */
  block(x, y) {
    if (this.inside(x, y)) this.collision[this.index(x, y)] = 1;
  }

  /** Paint a floor pattern over a rectangle (both ends included). Patterns line up across the map. */
  floor(x1, y1, x2, y2, pattern) {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        const row = pattern[y % pattern.length];
        this.set('floor', x, y, row[x % row.length]);
      }
    }
  }

  /** The face colour for walls inside this rectangle. Rooms register theirs; first match wins. */
  faceStyle(x1, y1, x2, y2, style) {
    this.faceStyles.push({ x1, y1, x2, y2, style });
  }

  /** A wall line (both ends included), one tile thick: a dark top that blocks walking. */
  wallLine(x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        this.isWall[this.index(x, y)] = true;
      }
    }
  }

  /** The four walls around a room (its outer rectangle). */
  roomWalls(x1, y1, x2, y2) {
    this.wallLine(x1, y1, x2, y1);
    this.wallLine(x1, y2, x2, y2);
    this.wallLine(x1, y1, x1, y2);
    this.wallLine(x2, y1, x2, y2);
  }

  /** A door: take the wall away over these tiles (both ends included). */
  door(x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        this.isWall[this.index(x, y)] = false;
        this.doorCells.add(this.index(x, y));
      }
    }
  }

  /**
   * Draw a stamp with its top-left tile at (x, y). Solid stamps block every tile they cover
   * (except empty cells). Returns the tiles it covered.
   */
  stamp(stamp, x, y) {
    stamp.rows.forEach((row, dy) => {
      row.forEach((gid, dx) => {
        if (!gid) return;
        this.set(stamp.layer, x + dx, y + dy, gid);
        if (stamp.solid) this.block(x + dx, y + dy);
      });
    });
  }

  /** One tile on a layer, optionally solid. */
  tile(layerName, x, y, gid, solid = false) {
    this.set(layerName, x, y, gid);
    if (solid) this.block(x, y);
  }

  /** Which face colour applies at (x, y)? */
  styleAt(x, y) {
    const match = this.faceStyles.find((s) => x >= s.x1 && x <= s.x2 && y >= s.y1 && y <= s.y2);
    return FACES[match ? match.style : 'salmon'];
  }

  /**
   * Turn wall tops into tiles, add the faces, and block both. Call once, after all walls and doors.
   * A face is 2 tiles tall; it is drawn on the floor tiles south of a wall top (but never over
   * another wall top). The ends of a face run get the end pieces (they have a darker edge line).
   */
  finishWalls() {
    const faceRows = new Map(); // index → 'top' | 'bottom'
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!this.isWall[this.index(x, y)]) continue;
        this.set('walls', x, y, WALL_TOP);
        this.block(x, y);
        // (A wall right above a door in a side wall gets no face: it would close the door.)
        const below = this.index(x, y + 1);
        if (y + 1 < this.height && !this.isWall[below] && !this.doorCells.has(below)) {
          faceRows.set(below, 'top');
          const twoBelow = this.index(x, y + 2);
          if (y + 2 < this.height && !this.isWall[twoBelow] && !this.doorCells.has(twoBelow)) faceRows.set(twoBelow, 'bottom');
        }
      }
    }
    for (const [index, row] of faceRows) {
      const x = index % this.width;
      const y = Math.floor(index / this.width);
      const style = this.styleAt(x, y)[row];
      const leftIsFace = faceRows.get(this.index(x - 1, y)) === row && x > 0;
      const rightIsFace = faceRows.get(this.index(x + 1, y)) === row && x + 1 < this.width;
      const gid = !leftIsFace ? style[0] : !rightIsFace ? style[2] : style[1];
      this.set('walls', x, y, gid);
      this.block(x, y);
    }
    this.faceRows = faceRows;
  }

  /** Is (x, y) a wall top or a wall face? (After finishWalls.) Used to keep furniture off walls. */
  isWallTile(x, y) {
    return this.layers.walls[this.index(x, y)] !== 0;
  }

  /** The finished Tiled tile layers, in drawing order, plus the invisible collision layer. */
  tileLayers() {
    const layers = LAYER_NAMES.map((name, i) => ({
      id: i + 1,
      name,
      type: 'tilelayer',
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      opacity: 1,
      visible: true,
      data: this.layers[name],
    }));
    layers.push({
      id: LAYER_NAMES.length + 1,
      name: 'collision',
      type: 'tilelayer',
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      opacity: 1,
      visible: false,
      data: this.collision,
    });
    return layers;
  }
}
