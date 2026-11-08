import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: { __DEV__: 'true' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'expo-asset': path.resolve(__dirname, './src/test-mocks/expo-asset.ts'),
    },
  },
  test: {
    include: [
      'src/storage/__tests__/**/*.test.ts',
      'src/api/__tests__/**/*.test.ts',
      'src/lib/__tests__/**/*.test.ts',
      'src/features/**/__tests__/**/*.test.ts',
    ],
    exclude: ['**/*.test.mjs', '**/node_modules/**'],
    environment: 'node',
    globals: false,
    testTimeout: 10_000,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        external: [/^node:/],
        inline: [/expo-asset/, /expo-modules-core/, /expo-crypto/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test-mocks/**',
        'src/types/**',
        'src/**/*.d.ts'
      ],
    },
  },
});
