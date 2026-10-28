import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src https://www.interceptor.cn",
  "worker-src 'self' blob:",
].join('; ');

const developmentCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src https://www.interceptor.cn",
  "worker-src 'self' blob:",
].join('; ');

export default defineConfig(({ command }) => ({
  plugins: [react(), contentSecurityPolicy(command === 'serve')],
  build: {
    license: { fileName: 'renderer-licenses.txt' },
    // CSP 的 font-src 只允许 self；字体子集一旦内联成 data: URL 会被拦截并回落到系统字体，
    // 所以字体始终输出为独立文件（Noto Sans SC 按 unicode-range 拆成 101 个子集）。
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/.test(filePath) ? false : undefined),
  },
}));

function contentSecurityPolicy(development: boolean): Plugin {
  return {
    name: 'interceptor-content-security-policy',
    transformIndexHtml(html) {
      return html.replace(
        '__INTERCEPTOR_CSP__',
        development ? developmentCsp : productionCsp,
      );
    },
  };
}