// client/vite.config.js — Person 1
// Vite settings for the browser app.
//   - The React plugin lets Vite understand .jsx files.
//   - The @shared alias means `import { EVENTS } from '@shared/events.js'` reads ../shared/events.js.
//   - server.fs.allow lets the dev server serve files from outside client/ (the shared/ folder).

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
});
