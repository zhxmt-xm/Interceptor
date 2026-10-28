import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';

import { DesignApp } from './DesignApp/DesignApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing design app root');

createRoot(root).render(<DesignApp />);
