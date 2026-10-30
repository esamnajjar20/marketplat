import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: { __DEV__: 'true' },
  test: {
    include: [
      'src/storage/__tests__/**/*.test.ts',
      'src/api/__tests__/**/*.test.ts',
      'src/lib/__tests__/**/*.test.ts',
      'src/features/auth/__tests__/**/*.test.ts',
    ],
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
