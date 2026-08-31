import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    include: [
      'src/**/tests/**/*.test.ts',
      'tests/e2e-workflow-tests/fixtures/tests/unit/**/*.test.ts',
    ],
    // @peculiar/x509 依赖 tsyringe，需要在任何证书代码加载前建立 reflect-metadata polyfill。
    setupFiles: ['reflect-metadata'],
  },
});