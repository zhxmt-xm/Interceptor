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