// client/vite.config.js — Person 1
// Vite settings for the browser app.
//   - The React plugin lets Vite understand .jsx files.
//   - The @shared alias means `import { EVENTS } from '@shared/events.js'` reads ../shared/events.js.
//   - server.fs.allow lets the dev server serve files from outside client/ (the shared/ folder).
//   - envDir points at the repo root, so Vite reads the same .env file as the server.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The folder this file is in (client/). fileURLToPath turns "file:///C:/..." into a normal path.
const clientDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  // Where Vite looks for .env files. By default it looks in client/, but our one .env file lives
  // in the repo root (one level up). Only variables whose names start with VITE_ (e.g.
  // VITE_SERVER_URL) reach the browser code, so server secrets like MONGODB_URI never do.
  // On Render there is no .env file: Vite then takes VITE_ variables from the real environment
  // (Render's dashboard) instead. They are baked into the built files by `npm run build`, so
  // after changing one on Render the client must be built (deployed) again.
  envDir: path.resolve(clientDir, '..'),
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
});
