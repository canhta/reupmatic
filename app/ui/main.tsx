import { Banner } from '@astryxdesign/core/Banner';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { App } from './App';
import { DesignSystemProvider } from './design-system/DesignSystemProvider';
import { DiagnosticBoundary } from './shell/DiagnosticBoundary';
import { installRendererDiagnostics } from './shell/diagnostics';
import './i18n';
import './style.css';

// Installed before the first render, so a failure during mount is captured too (D-61).
installRendererDiagnostics();

function RenderFailed() {
  const { t } = useTranslation();
  return (
    <Banner status="error" title={t('renderFailedTitle')} description={t('renderFailedDetail')} />
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
// One renderer bundle, one BrowserWindow, one mounted root: D-57 removed the independent
// Settings window, so there is no longer a second `?view=` this entry point needs to branch on.
createRoot(root).render(
  <DesignSystemProvider>
    <DiagnosticBoundary fallback={<RenderFailed />}>
      <App />
    </DiagnosticBoundary>
  </DesignSystemProvider>,
);
