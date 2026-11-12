// server/scripts/capture-map-preview.js — Person 1
// Draws the whole office map in a headless Chrome and saves it as a picture:
//   client/public/office-preview.png  (the landing page's preview; our own map, our own art)
//
// How to run it:
//   1. In client/:  npm run dev        (Vite on http://localhost:5173)
//   2. From the repo root:  node server/scripts/capture-map-preview.js [outputPath] [widthPx]
//
// It loads the world module's own loadOfficeMap + drawMap inside the page (Vite serves the source
// files), so the picture is exactly what the game draws.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const OUTPUT = process.argv[2] || fileURLToPath(new URL('../../client/public/office-preview.png', import.meta.url));
// The preview is drawn at full size, then scaled down to this width (smooth scaling looks better
// than pixel-dropping when shrinking).
const PREVIEW_WIDTH_PX = Number(process.argv[3]) || 1400;

async function main() {
  const page = await launchChrome({ width: 800, height: 600 });
  try {
    await page.goto(`${CLIENT_URL}/?lab=world`, 2500);
    const dataUrl = await page.eval(`(async () => {
      const world = await import('/src/world/map.js');
      const map = await world.loadOfficeMap();
      const full = document.createElement('canvas');
      full.width = map.width * map.tileSize;
      full.height = map.height * map.tileSize;
      const ctx = full.getContext('2d');
      ctx.fillStyle = '#8fd3f4';
      ctx.fillRect(0, 0, full.width, full.height);
      world.drawMap(ctx, map, { x: 0, y: 0 });
      const scale = ${PREVIEW_WIDTH_PX} / full.width;
      const small = document.createElement('canvas');
      small.width = Math.round(full.width * scale);
      small.height = Math.round(full.height * scale);
      const smallCtx = small.getContext('2d');
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.imageSmoothingQuality = 'high';
      smallCtx.drawImage(full, 0, 0, small.width, small.height);
      return small.toDataURL('image/png');
    })()`);
    writeFileSync(OUTPUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`[preview] saved ${OUTPUT}`);
  } finally {
    await page.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
