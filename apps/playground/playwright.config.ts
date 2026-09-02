import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/integration',
  testMatch: '**/*.browser.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4176',
    channel: 'msedge',
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    env: { PLAYGROUND_PORT: '4176' },
    url: 'http://127.0.0.1:4176/api/runtime',
    reuseExistingServer: false,
  },
});