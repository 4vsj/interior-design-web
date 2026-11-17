import { defineConfig } from 'vite';

// Relative base so the built site works from any folder or static host.
// `vite build --mode single` keeps everything in one script (used for single-file previews).
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    ...(mode === 'single' && {
      outDir: 'dist-single',
      rolldownOptions: { output: { inlineDynamicImports: true } },
    }),
  },
}));
