import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: mode !== 'production',
    rollupOptions: {
      // @peculiar/x509 与其运行时依赖（reflect-metadata/tslib/tsyringe/asn1js 等）含 CJS
      // 与 tslib helper；被 rolldown 打包时 __toESM interop 会把 tslib `__extends` 变成
      // undefined，导致 ca:generate/ca:install 一 `await import('@peculiar/x509')` 就崩。
      // 标记为 external，运行时直接从 node_modules require，绕过打包 interop。
      external: ['@peculiar/x509', 'reflect-metadata', '@vscode/sudo-prompt'],
    },
  },
}));