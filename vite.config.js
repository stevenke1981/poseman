import { defineConfig } from 'vite';

// Explicit empty PostCSS config so Vite does not pick up stray
// postcss.config.* files from parent directories (e.g. D:\postcss.config.mjs).
export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
  build: {
    rollupOptions: {
      output: {
        // Split three.js into its own chunk so app-code edits do not
        // invalidate the cached library bundle.
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 5173,
  },
});
