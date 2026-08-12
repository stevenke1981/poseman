import { defineConfig } from 'vite';

// Explicit empty PostCSS config so Vite does not pick up stray
// postcss.config.* files from parent directories (e.g. D:\postcss.config.mjs).
export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
  build: {
    rolldownOptions: {
      output: {
        // Vite 8 uses Rolldown. Keep Three.js in a stable vendor chunk without
        // relying on the removed Rollup object-form manualChunks option.
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 20,
            },
          ],
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
