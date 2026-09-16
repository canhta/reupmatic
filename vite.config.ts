import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app/ui',
  publicDir: '../../public',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist-ui', emptyOutDir: true },
  worker: { format: 'es' },
});
