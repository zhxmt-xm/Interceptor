import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import 'antd/dist/reset.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './i18n/i18n';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element is missing');
}

window.addEventListener('error', (event) => {
  reportRendererDiagnostic('uncaught-error', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  reportRendererDiagnostic('unhandled-rejection', event.reason);
});

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function reportRendererDiagnostic(
  kind: 'uncaught-error' | 'unhandled-rejection',
  reason: unknown,
): void {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  void window.interceptor
    .reportRendererDiagnostic({
      kind,
      name: normalizeErrorName(error.name),
      message: error.message.slice(0, 512),
    })
    .catch(() => undefined);
}

function normalizeErrorName(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9._:-]/g, '_');
  return normalized.slice(0, 128) || 'Error';
}