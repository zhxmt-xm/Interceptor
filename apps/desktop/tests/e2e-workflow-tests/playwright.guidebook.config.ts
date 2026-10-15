import { defineConfig } from '@playwright/test';
import workflows from './playwright.config';

export default defineConfig({
  ...workflows,
  testMatch: '**/guidebook-*.workflow.ts',
  testIgnore: [],
  projects: [{
    name: 'macos-guidebook',
    use: { viewport: { width: 1600, height: 900 } },
  }],
});
