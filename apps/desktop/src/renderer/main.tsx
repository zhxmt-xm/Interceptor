import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import 'antd/dist/reset.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ApplicationStartup } from './app/ApplicationStartup/ApplicationStartup';
import { reportRendererDiagnostic } from './app/reportRendererDiagnostic';
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
    <ApplicationStartup />
  </StrictMode>,
);