// client/src/world/map.js — Person 3
// Handles loading and rendering the Tiled office map (office.json) and collisions.

/**
 * Loads the map data and tileset images.
 * In a standard Tiled setup, this fetches office.json and processes layers.
 */
export async function loadOfficeMap() {
  try {
    const response = await fetch('/maps/office.json');
    if (!response.ok) throw new Error('Failed to load office.json map data');
    const mapData = await response.json();
    
    return {
      width: mapData.width, // in tiles
      height: mapData.height,
      tileSize: mapData.tilewidth,
      layers: mapData.layers,
      tilesets: mapData.tilesets,
    };
  } catch (err) {
    console.warn('Map load fallback to procedural rendering until office.json is added:', err);
    return null;
  }
}

/**
 * Renders the map layers onto the Canvas Context.
 * Draws floor first, then furniture/walls, ensuring proper depth sorting.
 */
export function drawMap(ctx, map, camera) {
  if (!map || !map.layers) {
    // Procedural fallback matching the screenshot structure if office.json isn't compiled yet
    drawFallbackOffice(ctx, camera);
    return;
  }

  map.layers.forEach((layer) => {
    if (layer.type === 'tilelayer' && layer.visible) {
      // Loop through tile grid and draw individual tiles
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tileIndex = x + y * map.width;
          const tileId = layer.data[tileIndex];
          
          if (tileId === 0) continue; // Empty tile

          const screenX = x * map.tileSize - camera.x;
          const screenY = y * map.tileSize - camera.y;

          // Culling: Skip drawing tiles outside the current viewport
          if (
            screenX + map.tileSize < 0 ||
            screenY + map.tileSize < 0 ||
            screenX > ctx.canvas.width ||
            screenY > ctx.canvas.height
          ) {
            continue;
          }

          // Render tile graphic (Assumes a single loaded tileset image for simplicity)
          // ctx.drawImage(tilesetImage, srcX, srcY, tileSize, tileSize, screenX, screenY, tileSize, tileSize);
        }
      }
    }
  });
}

/**
 * Checks if a target coordinate collides with walls or furniture objects.
 */
export function checkCollision(x, y, map, avatarSize = 32) {
  if (!map || !map.layers) return false;

  const collisionLayer = map.layers.find(l => l.name === 'collision' || l.name === 'walls');
  if (!collisionLayer) return false;

  const tileSize = map.tileSize;

  // Check corners of the avatar bounding box
  const points = [
    { x: x, y: y },                           // Top-left
    { x: x + avatarSize, y: y },               // Top-right
    { x: x, y: y + avatarSize },               // Bottom-left
    { x: x + avatarSize, y: y + avatarSize }   // Bottom-right
  ];

  for (const pt of points) {
    const tileX = Math.floor(pt.x / tileSize);
    const tileY = Math.floor(pt.y / tileSize);

    if (tileX < 0 || tileX >= map.width || tileY < 0 || tileY >= map.height) {
      return true; // Out of bounds map edges
    }

    const index = tileX + tileY * map.width;
    if (collisionLayer.data && collisionLayer.data[index] > 0) {
      return true; // Collided with a solid block
    }
  }

  return false;
}

/**
 * Fallback visual structure mirroring your office layout design 
 * (Product Team desks, CX team room, Lounge, Cafeteria, Meeting Room).
 */
// function drawFallbackOffice(ctx, camera) {
//   const ox = -camera.x;
//   const oy = -camera.y;

//   // Start with one simple rectangular office shell.
//   const officeX = ox + 40;
//   const officeY = oy + 40;
//   const officeWidth = 920;
//   const officeHeight = 780;

//   // ctx.fillStyle = '#475569';
//   // ctx.fillRect(officeX, officeY, officeWidth, officeHeight);

//   // ctx.fillStyle = '#f8fafc';
//   // ctx.fillRect(officeX + 12, officeY + 12, officeWidth - 24, officeHeight - 24);

//   // ctx.strokeStyle = '#1e293b';
//   // ctx.lineWidth = 8;
//   // ctx.strokeRect(officeX, officeY, officeWidth, officeHeight);
// }