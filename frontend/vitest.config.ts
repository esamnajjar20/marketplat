import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Several tests type non-trivial Arabic strings via userEvent.type(),
    // which dispatches real per-character key events. On slower/CPU-
    // constrained machines this alone can exceed Vitest's 5000ms default,
    // causing spurious "Test timed out" failures unrelated to any actual
    // bug (observed on-device: passing tests already clocking in at
    // 5000-5700ms). 20s gives real headroom without masking a genuine hang.
    testTimeout: 20_000,
    hookTimeout: 20_000,
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
        // Phase 4: empty placeholder module (export {} only) — no runtime logic
        'lib/i18n/ar/common.ts',
      ],
      thresholds: {
        // Phase 4: raised global floor slightly after P0–P3 coverage work
        lines:     75,
        branches:  70,
        functions: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
