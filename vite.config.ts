import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  // @vitejs/plugin-react injects an inline <script> preamble (React Fast Refresh) into
  // index.html in dev; a nonce lets the strict CSP below allow just that script, matching
  // the app:// CSP in app/electron/runtime/protocols.ts otherwise. Dev-server-only: unset for
  // `vite build`, so it never affects the packaged app. Fixed (not random-per-run): this is
  // loopback-only dev tooling with no third-party content on the page, and a value that
  // changes every launch busts Vite's config-hash-keyed dependency-optimizer cache, forcing a
  // full re-scan and a page reload on every start that can race the initial script execution.
  const cspNonce = command === 'serve' ? 'reupmatic-dev' : undefined;

  return {
    root: 'app/ui',
    publicDir: '../../public',
    base: './',
    plugins: [react()],
    html: cspNonce ? { cspNonce } : undefined,
    server: cspNonce
      ? {
          headers: {
            'Content-Security-Policy': `default-src 'self'; script-src 'self' 'nonce-${cspNonce}' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: media:; media-src media: blob:; connect-src 'self' ws: media:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'`,
          },
        }
      : undefined,
    build: {
      outDir: '../../dist-ui',
      emptyOutDir: true,
      // Astryx ships as one indivisible vendor package (~730 kB) that no app-level split can break
      // up, so allow it while keeping the default warning meaningful for app code.
      chunkSizeWarningLimit: 800,
      // Single-window desktop shell with no route-level lazy loading, so the entry chunk pulls in
      // every library up front. Split the large third-party runtimes into their own chunks instead
      // of one >500 kB bundle (the default warning threshold).
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'media', test: /node_modules\/(wavesurfer\.js|jassub|@xzdarcy)\// },
              { name: 'astryx', test: /node_modules\/@astryxdesign\// },
              {
                name: 'react',
                test: /node_modules\/(react|react-dom|scheduler|i18next|react-i18next)\//,
              },
              { name: 'vendor', test: /node_modules\// },
            ],
          },
        },
      },
    },
    worker: { format: 'es' },
  };
});
