import { defineConfig } from '@playwright/test';

// On Windows use the installed Edge (no browser download needed); elsewhere the bundled Chromium
// (run `npx playwright install chromium` once). Override with PW_CHANNEL=chrome|msedge|chromium.
const envChannel = process.env.PW_CHANNEL;
const channel = envChannel ? (envChannel === 'chromium' ? undefined : envChannel) : process.platform === 'win32' ? 'msedge' : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    channel,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
