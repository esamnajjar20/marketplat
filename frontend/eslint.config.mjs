/**
 * ESLint flat config — Next.js 15 + TypeScript.
 *
 * FIX ESLINT-01: Migrated from legacy .eslintrc.json to flat config format.
 *   ESLint 9 (listed in devDeps) uses flat config by default.
 *   .eslintrc.json requires the legacy compatibility layer and emits
 *   deprecation warnings on every lint run.
 *
 * FIX ESLINT-02: Added react-hooks rules.
 *   Missing hooks rules allow exhaustive-deps violations to go undetected,
 *   causing stale closure bugs in useEffect/useCallback.
 *
 * FIX ESLINT-03: Added import/no-cycle rule.
 *   Catches the circular dependency pattern (client ↔ authApi) at lint time
 *   rather than runtime.
 *
 * FIX ESLINT-04: @typescript-eslint/no-explicit-any upgraded to 'error'.
 *   'warn' allows any-typed code to ship silently. The codebase should be
 *   fully typed — any 'any' usage should be a deliberate exception with
 *   an eslint-disable comment explaining why.
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // Next.js recommended rules (Core Web Vitals + TypeScript).
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // FIX ESLINT-05: '@typescript-eslint/no-floating-promises' and
  // 'await-thenable' are type-aware rules — they need real TS type
  // info (which requires knowing the type of every expression they
  // inspect), not just syntax. Without `parserOptions.project` telling
  // typescript-eslint which tsconfig to build a type-checker from,
  // ESLint has no type information at all and errors out the moment it
  // hits a file governed by either rule, instead of actually linting
  // it. Scoped to `files: ['**/*.ts', '**/*.tsx']` (rather than every
  // file ESLint touches) because project-aware parsing only works for
  // files tsconfig.json's `include` covers — pointing it at config
  // files like eslint.config.mjs itself would throw a
  // "file not found in project" parser error.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },

  {
    rules: {
      // ── TypeScript ─────────────────────────────────────────────
      // FIX ESLINT-04: error instead of warn — no silent any.
      '@typescript-eslint/no-explicit-any':      'error',
      '@typescript-eslint/no-unused-vars':        ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises':  'error',
      '@typescript-eslint/await-thenable':        'error',

      // ── General ────────────────────────────────────────────────
      'prefer-const':          'error',
      'no-console':            ['warn', { allow: ['warn', 'error'] }],
      'no-debugger':           'error',

      // ── React / Next.js ────────────────────────────────────────
      'react-hooks/exhaustive-deps': 'error',    // FIX ESLINT-02
      // Enforce Server Component boundaries.
      '@next/next/no-html-link-for-pages': 'error',
    },
  },

  // Relax rules for config files that legitimately use require() or any.
  {
    files: ['*.config.{js,mjs,ts}', 'postcss.config.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any':  'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Test files.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;
