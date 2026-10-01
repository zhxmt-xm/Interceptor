import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    include: ['src/**/tests/**/*.test.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
