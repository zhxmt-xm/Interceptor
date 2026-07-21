import path from 'node:path';

import { defineConfig } from '@playwright/test';

const desktopDirectory = path.resolve(__dirname, '../..');

export default defineConfig({
  testDir: path.join(__dirname, 'workflows'),
  testMatch: '**/*.workflow.ts',
  outputDir: path.join(desktopDirectory, 'test-results/e2e-workflow-tests'),
  preserveOutput: 'always',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: path.join(
          desktopDirectory,
          'playwright-report/e2e-workflow-tests',
        ),
        open: 'never',
      },
    ],
  ],
  use: {
    trace: 'off',
    screenshot: 'off',
  },
});
