import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'app/ui',
  publicDir: '../../public',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist-ui', emptyOutDir: true },
  worker: { format: 'es' },
});
