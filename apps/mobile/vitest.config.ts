import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['src/storage/__tests__/**/*.test.ts'],
    exclude: ['**/*.test.mjs', '**/node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
    // Tell Vitest not to try transforming Node built-in modules.
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
  ssr: {
    // Defense-in-depth: also mark node: modules external at the Vite level.
    external: [/^node:/],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
