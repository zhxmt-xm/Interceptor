import path from 'node:path';

import { defineConfig } from '@playwright/test';

import type { StepScreenshotOptions } from '../e2e-workflow-tests/fixtures/runtime/step-screenshots';

const desktopDirectory = path.resolve(__dirname, '../..');
const requestedLocale = process.env.INTERCEPTOR_E2E_LOCALE;
const locale = requestedLocale === undefined ? undefined : new Intl.Locale(requestedLocale).toString();

export default defineConfig<StepScreenshotOptions>({
  testDir: path.join(__dirname, 'workflows'),
  testMatch: '**/*.workflow.ts',
  outputDir: path.join(desktopDirectory, 'test-results/demo-workflow-tests'),
  preserveOutput: 'always',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    trace: 'off',
    screenshot: 'off',
    stepScreenshots: false,
    viewport: { width: 1600, height: 900 },
    ...(locale === undefined ? {} : { locale }),
  },
});
