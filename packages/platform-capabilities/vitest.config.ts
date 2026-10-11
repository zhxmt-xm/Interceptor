import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    include: ['src/**/tests/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      ...(process.platform !== 'darwin' ? ['src/**/macos/**'] : []),
      ...(process.platform !== 'win32' ? ['src/**/windows/**'] : []),
    ],
    setupFiles: ['reflect-metadata'],
  },
});
