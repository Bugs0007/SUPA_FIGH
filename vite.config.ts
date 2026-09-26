/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the static build works from any sub-path (GitHub Pages, Netlify, itch).
  base: './',
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
