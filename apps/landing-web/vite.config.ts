import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { snapshotApiPlugin } from './server/snapshot-api-plugin';

export default defineConfig({
  plugins: [react(), snapshotApiPlugin()],
  server: { port: 5175 },
  preview: { port: 4175 },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
});
