import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DesignSystemProvider } from './design-system/DesignSystemProvider';
import { DiagnosticBoundary } from './shell/DiagnosticBoundary';
import { installRendererDiagnostics } from './shell/diagnostics';
import { RenderFailed } from './shell/RenderFailed';
import './i18n';
import './style.css';

// Installed before the first render, so a failure during mount is captured too.
installRendererDiagnostics();

// No component may be declared here: Fast Refresh would make the entry accept hot updates and
// re-run createRoot on the mounted container instead of reloading the page.
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <DesignSystemProvider>
    <DiagnosticBoundary fallback={<RenderFailed />}>
      <App />
    </DiagnosticBoundary>
  </DesignSystemProvider>,
);
