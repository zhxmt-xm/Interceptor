import 'antd/dist/reset.css';
import { createRoot } from 'react-dom/client';

import { DesignApp } from './DesignApp/DesignApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing design app root');

createRoot(root).render(<DesignApp />);