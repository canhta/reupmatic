import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesignSystemProvider } from './design-system/DesignSystemProvider';
import './i18n';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<DesignSystemProvider><App /></DesignSystemProvider>);
