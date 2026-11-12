// client/src/world/map.js — Person 3
// Handles loading and rendering the Tiled office map (office.json) and collisions.

// Tiled bitwise flags for flipped and rotated tiles
const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG   = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG   = 0x20000000;

/**
 * Loads the map data and tileset images.
 * Fetches office.json and preloads all embedded tileset images.
 */
export async function loadOfficeMap(mapPath = '/maps/office.json') {
  try {
    const response = await fetch(mapPath);
    if (!response.ok) throw new Error(`Failed to load ${mapPath}`);
    const mapData = await response.json();

    // Preload all tileset images
    const tilesetPromises = (mapData.tilesets || []).map((tileset) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = `/maps/${tileset.image}`;
        img.onload = () => {
          tileset.img = img;
          resolve(tileset);
        };
        img.onerror = () => {
          console.warn(`[world] Failed to load tileset image: /maps/${tileset.image}`);
          tileset.img = null;
          resolve(tileset);
        };
      });
    });

    await Promise.all(tilesetPromises);
    console.log('[world] map and tilesets loaded successfully');

    return {
      width: mapData.width, // in tiles
      height: mapData.height,
      tileSize: mapData.tilewidth,
      layers: mapData.layers,
      tilesets: mapData.tilesets,
    };
  } catch (err) {
    console.warn('[world] Map load error:', err);
    return null;
  }
}

/**
 * Renders the map layers onto the Canvas Context.
 * Draws floor first, then walls and furniture with proper depth sorting.
 */
export function drawMap(ctx, map, camera) {
  if (!map || !map.layers || !map.tilesets) {
    return;
  }

  // Sort tilesets by firstgid descending so we can easily pick the matching one
  const sortedTilesets = [...map.tilesets].sort((a, b) => b.firstgid - a.firstgid);

  map.layers.forEach((layer) => {
    if (layer.type === 'tilelayer' && layer.visible) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tileIndex = x + y * map.width;
          const rawTileId = layer.data[tileIndex];

          if (!rawTileId || rawTileId === 0) continue; // Empty tile

          // Extract flip flags
          const flippedH = (rawTileId & FLIPPED_HORIZONTALLY_FLAG) !== 0;
          const flippedV = (rawTileId & FLIPPED_VERTICALLY_FLAG) !== 0;
          const flippedD = (rawTileId & FLIPPED_DIAGONALLY_FLAG) !== 0;

          // Clear flip flags to get the actual tile ID
          const cleanTileId = rawTileId & 0x1FFFFFFF;

          // Find which tileset this tile belongs to
          const tileset = sortedTilesets.find((ts) => cleanTileId >= ts.firstgid && ts.img);
          if (!tileset || !tileset.img) continue;

          const localId = cleanTileId - tileset.firstgid;
          const columns = tileset.columns || Math.floor(tileset.imagewidth / tileset.tilewidth);
          const srcX = (localId % columns) * tileset.tilewidth;
          const srcY = Math.floor(localId / columns) * tileset.tileheight;

          const screenX = x * map.tileSize - camera.x;
          const screenY = y * map.tileSize - camera.y;

          // Culling: Skip tiles completely outside the viewport
          if (
            screenX + map.tileSize < 0 ||
            screenY + map.tileSize < 0 ||
            screenX > ctx.canvas.width ||
            screenY > ctx.canvas.height
          ) {
            continue;
          }

          // Render with flip/rotation if needed
          if (flippedH || flippedV || flippedD) {
            let a = 1, b = 0, c = 0, d = 1;
            if (flippedD) {
              a = 0; b = 1; c = 1; d = 0;
            }
            if (flippedH) {
              a = -a;
              c = -c;
            }
            if (flippedV) {
              b = -b;
              d = -d;
            }

            ctx.save();
            ctx.translate(screenX + map.tileSize / 2, screenY + map.tileSize / 2);
            ctx.transform(a, b, c, d, 0, 0);
            ctx.drawImage(
              tileset.img,
              srcX,
              srcY,
              tileset.tilewidth,
              tileset.tileheight,
              -map.tileSize / 2,
              -map.tileSize / 2,
              map.tileSize,
              map.tileSize
            );
            ctx.restore();
          } else {
            ctx.drawImage(
              tileset.img,
              srcX,
              srcY,
              tileset.tilewidth,
              tileset.tileheight,
              screenX,
              screenY,
              map.tileSize,
              map.tileSize
            );
          }
        }
      }
    }
  });
}

/**
 * Draw the whole map ONCE onto its own hidden ("offscreen") canvas, the size of the map.
 * Why? Drawing 85 × 53 tiles × 9 layers is about 40 000 drawImage calls. Doing that 60 times a
 * second would be far too slow. The tiles never change, so we draw them once here, and every frame
 * just copies this one picture onto the screen (one drawImage), shifted and zoomed by the camera.
 * (v5, added by Person 1 for the office's camera and zoom.)
 *
 * @param {object} map - from loadOfficeMap()
 * @returns {HTMLCanvasElement | null}
 */
export function renderMapToCanvas(map) {
  if (!map) return null;
  const canvas = document.createElement('canvas');
  canvas.width = map.width * map.tileSize;
  canvas.height = map.height * map.tileSize;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawMap(ctx, map, { x: 0, y: 0 });
  return canvas;
}

/**
 * Checks if a target coordinate collides with walls or furniture objects.
 * v5: checks EVERY layer called "collision" or "walls" (the HQ map has both: "Walls" for the
 * drawn walls and an invisible "collision" layer that blocks the outside area).
 */
export function checkCollision(x, y, map, avatarSize = 24) {
  if (!map || !map.layers) return false;

  const collisionLayers = map.layers.filter((l) => {
    const name = (l.name || '').toLowerCase();
    return name === 'collision' || name === 'walls';
  });
  if (collisionLayers.length === 0) return false;
  for (const collisionLayer of collisionLayers) {
    if (layerBlocks(collisionLayer, x, y, map, avatarSize)) return true;
  }
  return false;
}

/** Does this one collision layer block an avatar at (x, y)? (The original check, per layer.) */
function layerBlocks(collisionLayer, x, y, map, avatarSize) {

  const tileSize = map.tileSize;

  // Check the 4 corners of the avatar's bounding box
  const points = [
    { x: x + 4, y: y + 8 },                             // Top-left
    { x: x + avatarSize - 4, y: y + 8 },                // Top-right
    { x: x + 4, y: y + avatarSize },                    // Bottom-left
    { x: x + avatarSize - 4, y: y + avatarSize },       // Bottom-right
  ];

  for (const pt of points) {
    const tileX = Math.floor(pt.x / tileSize);
    const tileY = Math.floor(pt.y / tileSize);

    if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
      return true; // Out of bounds map boundaries
    }

    const index = tileX + tileY * map.width;
    const rawTileId = collisionLayer.data ? collisionLayer.data[index] : 0;
    const cleanTileId = rawTileId & 0x1FFFFFFF;

    // Solid obstacle if tile is present and not an accidental floor tile (926 / 192)
    if (cleanTileId > 0 && cleanTileId !== 926 && cleanTileId !== 192) {
      return true; // Collided with a solid tile
    }
  }

  return false;
}
