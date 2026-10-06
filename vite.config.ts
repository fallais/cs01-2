import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build also works from a sub-path (e.g. GitHub Pages).
  base: './',
  worker: {
    // AudioWorklet modules are loaded with addModule(), which expects an ES module.
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
