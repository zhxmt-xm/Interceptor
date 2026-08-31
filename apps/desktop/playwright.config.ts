import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/packaged-smoke',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
  },
});