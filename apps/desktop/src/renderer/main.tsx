import '@fontsource-variable/ibm-plex-sans/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import 'antd/dist/reset.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Renderer root element is missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);