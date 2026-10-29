import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The app lives in web/, but the precomputed NASA data (data/) and the EIC
// cover art (assets/) live at the repo root so the Python pipeline and the
// browser share one source of truth. Allow Vite to serve/bundle from there.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: '.',
  base: './',
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
