import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // T-01 fix: "setupFilesAfterFramework" was a typo — correct key is "setupFilesAfterEnv"
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/config/**',
    '!src/**/*.d.ts',
    '!src/scripts/**', // one-off/E2E-setup scripts (seedE2E.ts) — not app logic, not meaningfully unit-testable
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  // FIX AUDIT-V5-01: no threshold existed at all — coverage was tracked
  // (reports generated) but never enforced, so nothing actually failed
  // CI if a large new module shipped with zero tests. Every existing
  // module (see src/modules/*) already has both a *.service.test.ts
  // (unit) and an integration test hitting its real HTTP routes, so
  // this isn't a new bar the codebase has to scramble to meet — it's
  // codifying the coverage level this codebase already has, so a
  // regression below it is now a build failure instead of a silent
  // drift. Matches marketplace-v10's vitest.config.ts thresholds
  // (70/65/70/70) for consistency across both repos rather than
  // picking an unrelated number for this one.
  coverageThreshold: {
    global: {
      lines: 70,
      branches: 65,
      functions: 70,
      statements: 70,
    },
  },
  testTimeout: 30000,
  // Shared DB cleanup in setup.ts — parallel workers cause FK race conditions
  maxWorkers: 1,
  // Run integration tests before unit tests (unit tests may spy on prisma/redis)
  testSequencer: '<rootDir>/tests/testSequencer.js',
  verbose: true,
};

export default config;
