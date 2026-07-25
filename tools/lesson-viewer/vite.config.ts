import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The lesson prototypes import UI primitives from "cursor/canvas" (the Cursor
// canvas SDK). We alias that module to a local shim implementing the same API
// with the app's design tokens, so the lessons render in the app theme.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'cursor/canvas': fileURLToPath(new URL('./src/canvas-sdk/index.tsx', import.meta.url)),
    },
  },
  server: { port: 4200 },
});
