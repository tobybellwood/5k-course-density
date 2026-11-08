import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Keep imported Leaflet PNGs as project-relative files rather than inlining them.
    assetsInlineLimit: 0,
  },
});
