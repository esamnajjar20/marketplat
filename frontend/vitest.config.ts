import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'lib/**',
        'store/**',
        'middleware.ts',
        'components/**',
        'hooks/**',
        'api/**',
      ],
      exclude: [
        '**/__tests__/**',
        '**/node_modules/**',
        '**/*.d.ts',
        'components/ui/**',      // shadcn primitives — not our code
      ],
      thresholds: {
        lines:     70,
        branches:  65,
        functions: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
