/**
 * ESLint 9 flat config for Next.js.
 *
 * eslint-config-next@15.x still ships legacy (eslintrc-style) configs,
 * so they must be wrapped with FlatCompat before they can be spread
 * into a flat config array. Without this, `...nextVitals` throws
 * "nextVitals is not iterable" because the export is a plain object.
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { globalIgnores } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // CACHE-BUILD-IGNORE: exclude build artifacts and generated files.
  // Without this, ESLint 9 walks .next/** (Next.js build output) and
  // produces hundreds of thousands of false errors on minified JS.
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/**/*.min.js',
    'public/tesseract/**',
    'public/sw-diagnostic.js',
    'android/**',
    'ios/**',
    'www/**',
    'lib/vendor/jsQR.js',
    'next-env.d.ts',
    '**/*.min.js',
    '**/*.bundle.js',
    // Backup snapshots — not part of the project
    '.backup_*/**',
    'backup*/**',
    // Receipt page is hand-minified.
    'app/(protected)/account/sales/**/receipt/page.tsx',
  ]),
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Type-aware linting for application, unit-test, and E2E TypeScript.
  // Each file is resolved through the TSConfig that actually includes it;
  // this catches async bugs and unsafe `any` flows beyond plain syntax lint.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.tests.json', './e2e/tsconfig.json'],
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },

  {
    rules: {
    // Modern TS: prefer @ts-expect-error with description. 25 legacy @ts-ignore remain.
    '@typescript-eslint/ban-ts-comment': 'warn',
    // Legacy files still use require(); migrate later.
    '@typescript-eslint/no-require-imports': 'warn',

    // TODO(ci): 132 real patterns flagged by 5.2.0. Fix incrementally, then flip to 'error'.
    'react-hooks/set-state-in-effect': 'warn',

      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',  // TODO: fix incrementally
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],

      // General
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // React
      // TODO: audit and fix incrementally.
      // These 11 occurrences are intentional patterns (refs, event handlers,
      // single-run effects) where adding the "missing" dependency would
      // cause regressions. Tracked for manual review.
      'react-hooks/exhaustive-deps': 'warn',

      // Enable diagnostics without making the existing baseline block CI.
      // Promote each rule to error only after its reported violations are fixed.,
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react/display-name': 'off',

      // Next.js
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },

  {
    files: ['*.config.{js,mjs,ts}', 'postcss.config.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Audit tools and generators are linted with targeted allowances:
  //   - use console.* for user-visible output
  //   - use `import()` type syntax for dynamic typing
  //   - use require() in .cjs (CommonJS)
  //   - keep some variables for side effects
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^(assert|exists|clock|sellersApi|QUEUE_DB)$',
          caughtErrors: 'none',
        },
      ],
    },
  },


  {
    files: ['scripts/**/*.{mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['../tsconfig.scripts.json'],
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // These rules use the TypeScript program and identify async/control-flow bugs
      // in standalone tools that were previously excluded from ESLint entirely.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'e2e/**/*.{ts,tsx}', '__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^(render|screen|waitFor|userEvent|beforeEach|useHomepage|useProducts|context|QUEUE_DB|assert|exists|clock|sellersApi)$',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    files: ['e2e/fixtures/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  // Capacitor's usePreferences has a misleading name — it's not a React Hook.
  // It's an async function that reads from native storage. ESLint flags every
  // call from non-hook functions as "rules-of-hooks" violation.
  {
    files: ['lib/capacitor/nativeSessionStorage.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // app/layout.tsx intentionally inlines a small theme-flash-prevention
  // script synchronously. It must run BEFORE paint to set the theme class,
  // so next/script with strategy="beforeInteractive" is the only correct
  // place. The lint rule is a default Next.js warning that doesn't apply
  // to this specific case.
  {
    files: ['app/layout.tsx'],
    rules: {
      '@next/next/no-sync-scripts': 'off',
    },
  },
];


export default eslintConfig;
