/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative base so the static build works from any sub-path (GitHub Pages, Netlify, itch).
  base: './',
  server: { port: 5173, strictPort: false },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // the engine changes rarely: its own chunk stays cached across game updates
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // headless bot matches take a few seconds each, longer when every test file runs in parallel
    testTimeout: 30_000,
  },
});
