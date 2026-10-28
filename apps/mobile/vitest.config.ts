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
        external: [/^node:/] as (string | RegExp)[],
      },
    },
  },
resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
