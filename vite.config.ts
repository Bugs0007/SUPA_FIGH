/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// VITE_ONLINE_SERVER (wss://your-server.example.com) is where the PLAY ONLINE button connects: set it as an environment
// variable of the Vercel project (or in a .env file) before building. Empty = the button explains that no online server
// is set up. See docs/ONLINE.md.
export default defineConfig(({ mode }) => ({
  // Relative base so the static build works from any sub-path (GitHub Pages, Netlify, itch).
  base: './',
  resolve: { extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.json'] },
  server: { port: 5173, strictPort: false },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __ONLINE_SERVER__: JSON.stringify((process.env.VITE_ONLINE_SERVER ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_ONLINE_SERVER ?? '').trim()),
  },
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
}));
